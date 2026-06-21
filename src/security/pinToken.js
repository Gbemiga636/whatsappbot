/**
 * Signed, time-limited tokens for the secure PIN web portal.
 */

const crypto = require('crypto');
const config = require('../config');
const wallet = require('../wallet/walletService');

const usedNonces = new Map();

function secret() {
  return (
    config.security?.pinTokenSecret ||
    process.env.PIN_TOKEN_SECRET ||
    config.whatsapp.verifyToken ||
    'mysogi-pin-dev-secret'
  );
}

function ttlMs() {
  return (config.security?.pinPortalTtlMinutes || 15) * 60 * 1000;
}

function purgeNonces() {
  const now = Date.now();
  for (const [nonce, exp] of usedNonces.entries()) {
    if (exp < now) usedNonces.delete(nonce);
  }
}

function createPinToken(phone, purpose) {
  const payload = {
    phone: wallet.normalizePhone(phone),
    purpose,
    exp: Date.now() + ttlMs(),
    nonce: crypto.randomBytes(12).toString('hex'),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  return { token: `${data}.${sig}`, payload };
}

function verifyPinToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;

  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload?.phone || !payload?.purpose || !payload?.nonce) return null;
  if (Date.now() > payload.exp) return null;

  purgeNonces();
  if (usedNonces.has(payload.nonce)) return null;

  return payload;
}

function markPinTokenUsed(payload) {
  if (!payload?.nonce) return;
  usedNonces.set(payload.nonce, payload.exp || Date.now() + ttlMs());
}

function consumePinToken(token) {
  const payload = verifyPinToken(token);
  if (!payload) return null;
  markPinTokenUsed(payload);
  return payload;
}

module.exports = { createPinToken, verifyPinToken, consumePinToken, markPinTokenUsed };
