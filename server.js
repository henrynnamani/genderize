const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/classify", async (req, res) => {

  const { name } = req.query;


  if (name === undefined || name === "") {
    return res.status(400).json({
      status: "error",
      message: "Missing or empty 'name' query parameter",
    });
  }

  if (typeof name !== "string") {
    return res.status(422).json({
      status: "error",
      message: "Parameter 'name' must be a string",
    });
  }

  let genderizeData;
  try {
    const response = await axios.get(`https://api.genderize.io/`, {
      params: { name }
    });
    genderizeData = response.data;
  } catch (err) {
    console.error("Genderize error:", err.message);
    console.error("Error code:", err.code);
    console.error("Response:", err.response?.data);
    if (err.code === "ECONNABORTED") {
      return res.status(502).json({
        status: "error",
        message: "Genderize API request timed out",
      });
    }
    return res.status(502).json({
      status: "error",
      message: "Failed to reach Genderize API",
    });
  }

  if (!genderizeData.gender || genderizeData.count === 0) {
    return res.status(200).json({
      status: "error",
      message: "No prediction available for the provided name",
    });
  }

  const gender = genderizeData.gender;
  const probability = genderizeData.probability;
  const sample_size = genderizeData.count;
  const is_confident = probability >= 0.7 && sample_size >= 100;
  const processed_at = new Date().toISOString();

  return res.status(200).json({
    status: "success",
    data: {
      name: genderizeData.name,
      gender,
      probability,
      sample_size,
      is_confident,
      processed_at,
    },
  });
});

app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
