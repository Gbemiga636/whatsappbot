/**
 * Fast PIN entry — type 4 digits in one message (2 messages to set, 1 to verify).
 */

const whatsapp = require('../whatsapp');
const { setSession, getSession } = require('../sessionStore');
const transactionPin = require('./transactionPin');

const QUICK_STEPS = new Set(['pin_quick_set', 'pin_quick_confirm', 'pin_quick_verify']);

function isQuickPinStep(step) {
  return QUICK_STEPS.has(step);
}

function extractDigits(text) {
  return String(text || '').replace(/\D/g, '');
}

async function startQuickSetPin(phone, { pendingPurchase } = {}) {
  const session = getSession(phone) || { step: 'idle', data: {} };
  setSession(phone, {
    ...session,
    step: 'pin_quick_set',
    data: { ...session.data, pinDraft: null, pendingPurchase },
  });
  await whatsapp.sendText(
    phone,
    '🔐 *Create transaction PIN*\n\n' +
      `Type your ${transactionPin.PIN_LENGTH}-digit PIN and send in one message.\n` +
      '_Example: 4829_\n\n' +
      'Type *cancel* to stop · Type *keypad* for secure keypad'
  );
}

async function startQuickVerifyPin(phone, pendingPurchase) {
  if (transactionPin.isLocked(phone)) {
    await whatsapp.sendText(
      phone,
      `🔒 PIN locked. Try again in ${transactionPin.lockoutRemainingMinutes(phone)} minute(s).`
    );
    return false;
  }

  const session = getSession(phone) || { step: 'idle', data: {} };
  setSession(phone, {
    ...session,
    step: 'pin_quick_verify',
    data: { ...session.data, pendingPurchase },
  });
  await whatsapp.sendText(
    phone,
    '🔐 *Confirm purchase*\n\n' +
      `Type your ${transactionPin.PIN_LENGTH}-digit PIN in one message.\n\n` +
      'Type *cancel* to stop · Type *keypad* for secure keypad'
  );
  return true;
}

async function finishSetPin(phone, pin, data) {
  const result = await transactionPin.setPin(phone, pin);
  if (!result.ok) {
    await whatsapp.sendText(phone, `⚠️ ${result.message}`);
    await startQuickSetPin(phone, { pendingPurchase: data.pendingPurchase });
    return true;
  }

  await whatsapp.sendText(phone, '✅ *Transaction PIN set!*\n\nRequired before every purchase.');
  const session = getSession(phone) || {};
  setSession(phone, {
    ...session,
    step: session.activeService ? `${session.activeService}_menu` : 'super_menu',
    data: { ...session.data, pinDraft: null, pendingPurchase: data.pendingPurchase },
  });

  if (data.pendingPurchase) {
    const { resumePendingPurchase } = require('./pinGate');
    await resumePendingPurchase(phone, data.pendingPurchase, { pinVerified: true });
  }
  return true;
}

async function finishVerifyPin(phone, pin, data) {
  const result = await transactionPin.verifyPin(phone, pin);
  if (!result.ok) {
    await whatsapp.sendText(phone, `❌ ${result.message}`);
    if (!result.locked && data.pendingPurchase) {
      await startQuickVerifyPin(phone, data.pendingPurchase);
    }
    return true;
  }

  setSession(phone, {
    ...getSession(phone),
    data: { ...data, pinVerifiedAt: Date.now() },
  });
  const { resumePendingPurchase } = require('./pinGate');
  await resumePendingPurchase(phone, data.pendingPurchase, { pinVerified: true });
  return true;
}

async function handleQuickPinText(phone, text, session) {
  const raw = (text || '').trim();
  const lower = raw.toLowerCase();

  if (lower === 'cancel') {
    setSession(phone, {
      ...session,
      step: session.activeService ? `${session.activeService}_menu` : 'super_menu',
      data: { ...session.data, pinDraft: null, pendingPurchase: null },
    });
    await whatsapp.sendText(phone, 'PIN entry cancelled.');
    return true;
  }

  if (lower === 'keypad') {
    const pinPad = require('./pinPad');
    const data = session.data || {};
    if (session.step === 'pin_quick_verify') {
      await pinPad.startVerifyPin(phone, data.pendingPurchase);
    } else {
      await pinPad.startSetPin(phone, { pendingPurchase: data.pendingPurchase });
    }
    return true;
  }

  const digits = extractDigits(raw);
  const data = { ...(session.data || {}) };

  if (session.step === 'pin_quick_set') {
    const check = transactionPin.validatePinFormat(digits);
    if (!check.ok) {
      await whatsapp.sendText(phone, `⚠️ ${check.message}\n\nTry again.`);
      return true;
    }
    setSession(phone, {
      ...session,
      step: 'pin_quick_confirm',
      data: { ...data, pinDraft: check.digits },
    });
    await whatsapp.sendText(phone, '🔐 *Confirm PIN*\n\nType the same 4 digits again.');
    return true;
  }

  if (session.step === 'pin_quick_confirm') {
    if (digits !== data.pinDraft) {
      await whatsapp.sendText(phone, '❌ PINs do not match. Start again.');
      await startQuickSetPin(phone, { pendingPurchase: data.pendingPurchase });
      return true;
    }
    return finishSetPin(phone, digits, data);
  }

  if (session.step === 'pin_quick_verify') {
    if (digits.length !== transactionPin.PIN_LENGTH) {
      await whatsapp.sendText(
        phone,
        `Send exactly ${transactionPin.PIN_LENGTH} digits.`
      );
      return true;
    }
    return finishVerifyPin(phone, digits, data);
  }

  return false;
}

module.exports = {
  QUICK_STEPS,
  isQuickPinStep,
  startQuickSetPin,
  startQuickVerifyPin,
  handleQuickPinText,
};
