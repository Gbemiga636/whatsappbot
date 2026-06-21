const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, '..', 'data', 'otp-store.json');
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

function load() {
  try {
    if (fs.existsSync(STORE)) return JSON.parse(fs.readFileSync(STORE, 'utf8'));
  } catch {
    /* ignore */
  }
  return {};
}

function save(data) {
  const dir = path.dirname(STORE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2));
}

function hash(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function storeKey(phone, email) {
  return `${phone}:${email.trim().toLowerCase()}`;
}

function pruneExpired(entries) {
  const now = Date.now();
  for (const k of Object.keys(entries)) {
    if (entries[k].expiresAt <= now) delete entries[k];
  }
}

function createOtp(phone, email) {
  const entries = load();
  pruneExpired(entries);
  const k = storeKey(phone, email);

  const existing = entries[k];
  if (existing && existing.expiresAt > Date.now()) {
    const since = Date.now() - (existing.sentAt || 0);
    if (since < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - since) / 1000);
      return { ok: false, message: `Please wait ${wait}s before requesting another code.` };
    }
  }

  const code = String(crypto.randomInt(100000, 999999));
  entries[k] = {
    email: email.trim().toLowerCase(),
    phone,
    codeHash: hash(code),
    attempts: 0,
    sentAt: Date.now(),
    expiresAt: Date.now() + OTP_TTL_MS,
  };
  save(entries);

  return { ok: true, code, expiresInMinutes: OTP_TTL_MS / 60000 };
}

function verifyOtp(phone, email, code) {
  const entries = load();
  pruneExpired(entries);
  const k = storeKey(phone, email);
  const entry = entries[k];

  if (!entry || entry.expiresAt <= Date.now()) {
    return { ok: false, message: 'Code expired. Type *login* to get a new one.' };
  }

  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    delete entries[k];
    save(entries);
    return { ok: false, message: 'Too many wrong attempts. Type *login* to start again.' };
  }

  if (entry.codeHash !== hash(code)) {
    save(entries);
    const left = MAX_ATTEMPTS - entry.attempts + 1;
    return { ok: false, message: `Incorrect code. ${left} attempt(s) left.` };
  }

  delete entries[k];
  save(entries);
  return { ok: true, email: entry.email };
}

module.exports = { createOtp, verifyOtp };
