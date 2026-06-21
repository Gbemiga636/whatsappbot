/**
 * Writable data directory — local `data/` folder, or /tmp on serverless (Vercel/Netlify).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function isServerless() {
  return !!(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function getDataDir() {
  if (isServerless()) {
    return path.join(os.tmpdir(), 'mysogi-data');
  }
  return path.join(__dirname, '..', '..', 'data');
}

function dataFile(name) {
  return path.join(getDataDir(), name);
}

function safeMkdir(dir = getDataDir()) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function safeReadJson(filePath, fallback = {}) {
  try {
    safeMkdir(path.dirname(filePath));
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function safeWriteJson(filePath, data) {
  try {
    safeMkdir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

module.exports = { getDataDir, dataFile, safeMkdir, safeReadJson, safeWriteJson, isServerless };
