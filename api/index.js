const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_u7AdJ8NHGtvm@ep-green-dust-an1v8u2k-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      gender TEXT,
      gender_probability REAL,
      sample_size INTEGER,
      age INTEGER,
      age_group TEXT,
      country_id TEXT,
      country_probability REAL,
      created_at TEXT NOT NULL
    )
  `);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateUUIDv7() {
  const now = Date.now();
  const timHex = now.toString(16).padStart(12, "0");
  const rand = uuidv4().replace(/-/g, "").slice(12);
  const raw = `${timHex}7${rand}`;
  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    raw.slice(12, 16),
    raw.slice(16, 20),
    raw.slice(20, 32),
  ].join("-");
}

function classifyAgeGroup(age) {
  if (age <= 12) return "child";
  if (age <= 19) return "teenager";
  if (age <= 59) return "adult";
  return "senior";
}

function formatProfile(row) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    gender_probability: row.gender_probability,
    sample_size: row.sample_size,
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
    country_probability: row.country_probability,
    created_at: row.created_at,
  };
}

function formatProfileList(row) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    age: row.age,
    age_group: row.age_group,
    country_id: row.country_id,
  };
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());

// ─── POST /api/profiles ───────────────────────────────────────────────────────
app.post("/api/profiles", async (req, res) => {
  const { name } = req.body;

  if (name === undefined || name === "") {
    return res.status(400).json({ status: "error", message: "Missing or empty name" });
  }
  if (typeof name !== "string") {
    return res.status(422).json({ status: "error", message: "name must be a string" });
  }

  const normalizedName = name.trim().toLowerCase();

  // Idempotency check
  const existing = await pool.query("SELECT * FROM profiles WHERE name = $1", [normalizedName]);
  if (existing.rows.length > 0) {
    return res.status(200).json({
      status: "success",
      message: "Profile already exists",
      data: formatProfile(existing.rows[0]),
    });
  }

  // ── Call all three APIs ──
  let genderizeData, agifyData, nationalizeData;

  try {
    const response = await axios.get("https://api.genderize.io/", { params: { name: normalizedName } });
    genderizeData = response.data;
  } catch (err) {
    return res.status(502).json({ status: "502", message: "Genderize returned an invalid response" });
  }

  try {
    const response = await axios.get("https://api.agify.io/", { params: { name: normalizedName } });
    agifyData = response.data;
  } catch (err) {
    return res.status(502).json({ status: "502", message: "Agify returned an invalid response" });
  }

  try {
    const response = await axios.get("https://api.nationalize.io/", { params: { name: normalizedName } });
    nationalizeData = response.data;
  } catch (err) {
    return res.status(502).json({ status: "502", message: "Nationalize returned an invalid response" });
  }

  // ── Validate responses ──
  if (!genderizeData.gender || genderizeData.count === 0) {
    return res.status(502).json({ status: "502", message: "Genderize returned an invalid response" });
  }
  if (agifyData.age === null || agifyData.age === undefined) {
    return res.status(502).json({ status: "502", message: "Agify returned an invalid response" });
  }
  if (!nationalizeData.country || nationalizeData.country.length === 0) {
    return res.status(502).json({ status: "502", message: "Nationalize returned an invalid response" });
  }

  // ── Process data ──
  const gender = genderizeData.gender;
  const gender_probability = genderizeData.probability;
  const sample_size = genderizeData.count;

  const age = agifyData.age;
  const age_group = classifyAgeGroup(age);

  const topCountry = nationalizeData.country.reduce((a, b) =>
    a.probability > b.probability ? a : b
  );
  const country_id = topCountry.country_id;
  const country_probability = topCountry.probability;

  const id = generateUUIDv7();
  const created_at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  // ── Persist ──
  await pool.query(
    `INSERT INTO profiles
      (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, normalizedName, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at]
  );

  const result = await pool.query("SELECT * FROM profiles WHERE id = $1", [id]);

  return res.status(201).json({ status: "success", data: formatProfile(result.rows[0]) });
});

// ─── GET /api/profiles ────────────────────────────────────────────────────────
app.get("/api/profiles", async (req, res) => {
  const { gender, country_id, age_group } = req.query;

  let query = "SELECT * FROM profiles WHERE 1=1";
  const params = [];
  let i = 1;

  if (gender) {
    query += ` AND LOWER(gender) = $${i++}`;
    params.push(gender.toLowerCase());
  }
  if (country_id) {
    query += ` AND LOWER(country_id) = $${i++}`;
    params.push(country_id.toLowerCase());
  }
  if (age_group) {
    query += ` AND LOWER(age_group) = $${i++}`;
    params.push(age_group.toLowerCase());
  }

  const result = await pool.query(query, params);

  return res.status(200).json({
    status: "success",
    count: result.rows.length,
    data: result.rows.map(formatProfileList),
  });
});

// ─── GET /api/profiles/:id ────────────────────────────────────────────────────
app.get("/api/profiles/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query("SELECT * FROM profiles WHERE id = $1", [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ status: "error", message: "Profile not found" });
  }

  return res.status(200).json({ status: "success", data: formatProfile(result.rows[0]) });
});

// ─── DELETE /api/profiles/:id ─────────────────────────────────────────────────
app.delete("/api/profiles/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query("SELECT * FROM profiles WHERE id = $1", [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ status: "error", message: "Profile not found" });
  }

  await pool.query("DELETE FROM profiles WHERE id = $1", [id]);
  return res.sendStatus(204);
});

// ─── Fallback ─────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to initialize DB:", err);
    process.exit(1);
  });

module.exports = app;