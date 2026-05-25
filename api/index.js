/**
 * Vercel serverless entry — exports the Express app.
 * Loads server with a safe fallback if bootstrap fails.
 */
let app;

try {
  app = require('../server/index');
} catch (err) {
  console.error('[api/index] Bootstrap failed:', err.stack || err.message);
  const express = require('express');
  app = express();
  app.get('/health', (_req, res) => {
    res.status(503).json({ ok: false, message: 'Server bootstrap failed' });
  });
  app.use((_req, res) => {
    res.status(500).json({
      message: 'Server is temporarily unavailable. Check Vercel env vars (DATABASE_URL, JWT_SECRET) and deployment logs.',
    });
  });
}

module.exports = app;
