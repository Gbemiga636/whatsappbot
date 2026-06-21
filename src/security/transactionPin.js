/**
 * Transaction PIN — hashed storage, lockout, verification.
 */

const crypto = require('crypto');
const { getUser, setUser } = require('../userStore');
const { getSupabase } = require('../db/supabase');
const wallet = require('../wallet/walletService');
const config = require('../config');
const logger = require('../core/logger');

const PIN_LENGTH = config.security?.pinLength || 4;

function normalizePhone(phone) {
  return wallet.normalizePhone(phone);
}

function getPinRecord(phone) {
  const user = getUser(normalizePhone(phone));
  return user?.metadata?.transaction_pin || null;
}

function isPinSet(phone) {
  return !!getPinRecord(phone)?.hash;
}

function isLocked(phone) {
  const rec = getPinRecord(phone);
  if (!rec?.locked_until) return false;
  return Date.now() < new Date(rec.locked_until).getTime();
}

function lockoutRemainingMinutes(phone) {
  const rec = getPinRecord(phone);
  if (!rec?.locked_until) return 0;
  const ms = new Date(rec.locked_until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 64).toString('hex');
}

function validatePinFormat(pin) {
  const digits = String(pin).replace(/\D/g, '');
  if (digits.length !== PIN_LENGTH) {
    return { ok: false, message: `PIN must be exactly ${PIN_LENGTH} digits.` };
  }
  if (!/^\d+$/.test(digits)) {
    return { ok: false, message: 'PIN must contain only numbers.' };
  }
  if (/^(\d)\1+$/.test(digits)) {
    return { ok: false, message: 'PIN is too weak. Avoid repeating digits (e.g. 1111).' };
  }
  return { ok: true, digits };
}

async function savePinRecord(phone, record) {
  const normalized = normalizePhone(phone);
  const user = getUser(normalized) || { phone: normalized };
  const metadata = { ...(user.metadata || {}), transaction_pin: record };
  setUser(normalized, { metadata });

  const db = getSupabase();
  if (db) {
    db.from('whatsapp_users')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('phone', normalized)
      .then(({ error }) => {
        if (error) logger.warn('Supabase savePinRecord failed', { phone: normalized, error: error.message });
      })
      .catch((err) => logger.warn('Supabase savePinRecord error', { phone: normalized, error: err.message }));
  }
}

async function setPin(phone, pin) {
  const check = validatePinFormat(pin);
  if (!check.ok) return check;

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPin(check.digits, salt);

  await savePinRecord(phone, {
    hash,
    salt,
    failed_attempts: 0,
    locked_until: null,
    set_at: new Date().toISOString(),
  });

  logger.info('Transaction PIN set', { phone: normalizePhone(phone) });
  return { ok: true };
}

async function verifyPin(phone, pin) {
  const normalized = normalizePhone(phone);

  if (isLocked(normalized)) {
    return {
      ok: false,
      locked: true,
      message: `PIN locked. Try again in ${lockoutRemainingMinutes(normalized)} minute(s).`,
    };
  }

  const rec = getPinRecord(normalized);
  if (!rec?.hash) {
    return { ok: false, needsSetup: true, message: 'Set your transaction PIN first.' };
  }

  const check = validatePinFormat(pin);
  if (!check.ok) return check;

  const hash = hashPin(check.digits, rec.salt);
  if (hash === rec.hash) {
    await savePinRecord(normalized, {
      ...rec,
      failed_attempts: 0,
      locked_until: null,
      last_verified_at: new Date().toISOString(),
    });
    return { ok: true };
  }

  const attempts = (rec.failed_attempts || 0) + 1;
  const max = config.security?.maxPinAttempts || 5;
  const lockoutMin = config.security?.pinLockoutMinutes || 15;
  const locked_until =
    attempts >= max ? new Date(Date.now() + lockoutMin * 60000).toISOString() : rec.locked_until;

  await savePinRecord(normalized, {
    ...rec,
    failed_attempts: attempts,
    locked_until,
  });

  if (attempts >= max) {
    return {
      ok: false,
      locked: true,
      message: `Too many wrong PINs. Locked for ${lockoutMin} minutes.`,
    };
  }

  return {
    ok: false,
    message: `Wrong PIN. ${max - attempts} attempt(s) left.`,
    attemptsLeft: max - attempts,
  };
}

function maskProgress(count) {
  const filled = '●'.repeat(Math.min(count, PIN_LENGTH));
  const empty = '○'.repeat(Math.max(0, PIN_LENGTH - count));
  return filled + empty;
}

module.exports = {
  PIN_LENGTH,
  isPinSet,
  isLocked,
  lockoutRemainingMinutes,
  setPin,
  verifyPin,
  validatePinFormat,
  maskProgress,
};
