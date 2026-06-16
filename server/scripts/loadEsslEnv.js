const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

/**
 * Load env for ESSL scripts.
 * - Always load `.env` first.
 * - If `ENV_FILE` is set, load that file and override existing values.
 * - Else if `.env.bridge` exists, load it and override `.env`.
 */
function loadEsslEnv() {
  const root = path.join(__dirname, '../..');
  const defaultEnvPath = path.join(root, '.env');
  const bridgeEnvPath = path.join(root, '.env.bridge');
  const customEnvFile = process.env.ENV_FILE ? path.resolve(root, process.env.ENV_FILE) : '';

  dotenv.config({ path: defaultEnvPath });

  const parseEnvText = (raw) => {
    const parsed = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      parsed[key] = value;
    }
    return parsed;
  };

  const forceLoadFromFile = (filePath) => {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = parseEnvText(raw);
    Object.keys(parsed).forEach((key) => {
      process.env[key] = parsed[key];
    });
  };

  if (customEnvFile) {
    forceLoadFromFile(customEnvFile);
    return;
  }

  if (fs.existsSync(bridgeEnvPath)) {
    forceLoadFromFile(bridgeEnvPath);
  }
}

module.exports = { loadEsslEnv };
