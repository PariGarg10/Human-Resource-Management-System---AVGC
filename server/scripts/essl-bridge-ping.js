/**
 * Test office PC → Vercel HRMS API (no device required).
 *   npm run essl:bridge:ping
 */
require('dotenv').config();

function config() {
  return {
    hrmsUrl: (process.env.HRMS_API_URL || process.env.FRONTEND_URL || '').replace(/\/$/, ''),
    apiKey: process.env.BIOMETRIC_API_KEY,
  };
}

async function main() {
  const cfg = config();
  if (!cfg.hrmsUrl) {
    console.error('[essl-bridge-ping] Set HRMS_API_URL in .env');
    process.exit(1);
  }
  if (!cfg.apiKey) {
    console.error('[essl-bridge-ping] Set BIOMETRIC_API_KEY in .env');
    process.exit(1);
  }

  const url = `${cfg.hrmsUrl}/api/biometric/essl-sync`;
  console.log(`[essl-bridge-ping] POST ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
    },
    body: JSON.stringify({ records: [] }),
  });

  const data = await response.json().catch(() => ({}));
  console.log(`[essl-bridge-ping] HTTP ${response.status}`, data);

  if (response.status === 401) {
    console.error('[essl-bridge-ping] API key rejected — set the same BIOMETRIC_API_KEY on Vercel and redeploy.');
    process.exit(1);
  }
  if (response.status === 400 && data.message === 'records array is required') {
    console.log('[essl-bridge-ping] OK — Vercel API reachable and API key accepted.');
    return;
  }
  if (!response.ok) {
    console.error('[essl-bridge-ping] Unexpected response:', data.message || response.statusText);
    process.exit(1);
  }
  console.log('[essl-bridge-ping] OK — Vercel connection works.');
}

main().catch((err) => {
  console.error('[essl-bridge-ping] Failed:', err.message);
  process.exit(1);
});
