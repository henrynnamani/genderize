```markdown
## Prerequisites
- Node.js (v18 or higher)
- npm or yarn

## Setup

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd <project-folder>
```

2. **Install dependencies**
```bash
npm install
```


## Running Locally

### Development mode (with auto-reload)
```bash
npm run dev
```
or
```bash
node --watch server.js
```

### Production mode
```bash
npm start
```
or
```bash
node server.js
```

## Testing the Server

Once running, your server will be available at:
- `http://localhost:3000`

Test with curl:
```bash
# Health check
curl http://localhost:3000/health

# Test webhook endpoint locally (use ngrok for actual Paystack testing)
curl -X POST http://localhost:3000/webhook/paystack \
  -H "Content-Type: application/json" \
  -d '{"event":"charge.success","data":{"reference":"test"}}'
```

## Testing Paystack Webhooks Locally

Use **ngrok** to expose your local server to the internet:

```bash
# Install ngrok (one time)
npm install -g ngrok

# Expose your local server
ngrok http 3000
```

This gives you a public URL like `https://abc123.ngrok.io` - use this in Paystack's test webhook configuration.

## Notes
- The server runs on port 3000 by default
- No database is required locally - it connects to Convex cloud
- For production deployment, use PM2 or systemd instead of `node server.js`
```
