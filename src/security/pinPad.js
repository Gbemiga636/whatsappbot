/**
 * Secure PIN pad — digits visible on the keypad picker only.
 * Chat history shows "·" per tap, never the actual PIN digits.
 */

const whatsapp = require('../whatsapp');
const { setSession, getSession } = require('../sessionStore');
const transactionPin = require('./transactionPin');

const PIN_STEPS = new Set([
  'pin_set',
  'pin_set_confirm',
  'pin_verify',
  'pin_change',
  'pin_flow_set',
  'pin_flow_verify',
  'pin_flow_change',
]);

function isPinStep(step) {
  return PIN_STEPS.has(step);
}

/** List row title stays "·" so the user's chat bubble never shows a digit. */
function digitRows() {
  return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => ({
    id: `pin_k_${d}`,
    title: '·',
    description: `Digit ${d}`,
  }));
}

function maskProgress(buffer) {
  const len = transactionPin.PIN_LENGTH;
  const filled = '●'.repeat(Math.min(buffer.length, len));
  const empty = '○'.repeat(Math.max(0, len - buffer.length));
  const count = buffer.length ? `  (${buffer.length}/${len})` : '';
  return `${filled}${empty}${count}`;
}

function stepBody(step) {
  const bodies = {
    pin_set: '🔐 *Create transaction PIN*',
    pin_set_confirm: '🔐 *Confirm transaction PIN*',
    pin_verify: '🔐 *Confirm purchase*',
    pin_change: '🔐 *New transaction PIN*',
  };
  return bodies[step] || '🔐 *Enter PIN*';
}

function buildKeypadText(step, buffer) {
  return (
    `${stepBody(step)}\n\n` +
    `${maskProgress(buffer)}\n\n` +
    '_Open the keypad below — digits show on the pad only, never in chat._\n' +
    'Type *cancel* to stop.'
  );
}

async function persistPadState(phone, { mode, buffer, data, extra = {} }) {
  const session = getSession(phone) || { step: 'idle', data: {} };
  setSession(phone, {
    ...session,
    step: mode,
    data: {
      ...session.data,
      ...data,
      ...extra,
      pinBuffer: buffer,
      pinMode: mode,
    },
  });
}

async function sendKeypad(phone, step, buffer, data, { withControls = false } = {}) {
  await whatsapp.sendList(
    phone,
    buildKeypadText(step, buffer),
    'Keypad',
    [{ title: 'Digits 0–9', rows: digitRows() }]
  );

  if (withControls) {
    await whatsapp.sendButtons(phone, 'PIN options', [
      { id: 'pin_clear', title: '⌫ Delete' },
      { id: 'pin_cancel', title: '✕ Cancel' },
    ]);
  }

  await persistPadState(phone, { mode: step, buffer, data });
}

async function refreshKeypad(phone, step, buffer, data) {
  await whatsapp.sendList(
    phone,
    buildKeypadText(step, buffer),
    'Keypad',
    [{ title: 'Digits 0–9', rows: digitRows() }]
  );
  await persistPadState(phone, { mode: step, buffer, data });
}

async function clearPinSession(phone, session, extraData = {}) {
  setSession(phone, {
    ...session,
    step: session.activeService ? `${session.activeService}_menu` : 'super_menu',
    data: {
      ...session.data,
      ...extraData,
      pinBuffer: [],
      pinDraft: null,
      pendingPurchase: null,
    },
  });
}

async function startSetPin(phone, { pendingPurchase } = {}) {
  await sendKeypad(phone, 'pin_set', [], { pendingPurchase }, { withControls: true });
}

async function startVerifyPin(phone, pendingPurchase) {
  if (transactionPin.isLocked(phone)) {
    await whatsapp.sendText(
      phone,
      `🔒 PIN locked. Try again in ${transactionPin.lockoutRemainingMinutes(phone)} minute(s).`
    );
    return false;
  }

  await sendKeypad(phone, 'pin_verify', [], { pendingPurchase }, { withControls: true });
  return true;
}

async function handlePinChoice(phone, choice, session) {
  if (!choice?.startsWith('pin_')) return false;

  const data = { ...session.data };

  if (choice === 'pin_cancel') {
    await clearPinSession(phone, session);
    await whatsapp.sendText(phone, 'PIN entry cancelled.');
    return true;
  }

  let buffer = [...(data.pinBuffer || [])];

  if (choice === 'pin_clear') {
    buffer = buffer.slice(0, -1);
    await refreshKeypad(phone, session.step, buffer, data);
    return true;
  }

  if (choice.startsWith('pin_k_')) {
    if (buffer.length >= transactionPin.PIN_LENGTH) {
      await whatsapp.sendText(phone, 'PIN complete. Tap Delete to change a digit.');
      return true;
    }
    buffer.push(choice.replace('pin_k_', ''));
    data.pinBuffer = buffer;

    if (buffer.length < transactionPin.PIN_LENGTH) {
      await refreshKeypad(phone, session.step, buffer, data);
      return true;
    }

    const pin = buffer.join('');
    return finishPinEntry(phone, session.step, pin, data);
  }

  return false;
}

async function handlePinText(phone, text, session) {
  const lower = (text || '').trim().toLowerCase();
  if (lower === 'cancel') {
    await clearPinSession(phone, session);
    await whatsapp.sendText(phone, 'PIN entry cancelled.');
    return true;
  }

  if (/^\d+$/.test((text || '').trim())) {
    await whatsapp.sendText(
      phone,
      '🔒 For security, use the *keypad* above — don\'t type your PIN as text (it stays in chat).'
    );
    return true;
  }

  return false;
}

async function finishPinEntry(phone, step, pin, data) {
  if (step === 'pin_set' || step === 'pin_change') {
    const check = transactionPin.validatePinFormat(pin);
    if (!check.ok) {
      await whatsapp.sendText(phone, `⚠️ ${check.message}`);
      await startSetPin(phone, { pendingPurchase: data.pendingPurchase });
      return true;
    }
    setSession(phone, {
      step: 'pin_set_confirm',
      activeService: getSession(phone)?.activeService,
      data: { ...data, pinBuffer: [], pinDraft: pin, pendingPurchase: data.pendingPurchase },
    });
    await sendKeypad(
      phone,
      'pin_set_confirm',
      [],
      { ...data, pinDraft: pin, pendingPurchase: data.pendingPurchase },
      { withControls: true }
    );
    return true;
  }

  if (step === 'pin_set_confirm') {
    if (pin !== data.pinDraft) {
      await whatsapp.sendText(phone, '❌ PINs do not match. Start again.');
      await startSetPin(phone, { pendingPurchase: data.pendingPurchase });
      return true;
    }
    const result = await transactionPin.setPin(phone, pin);
    if (!result.ok) {
      await whatsapp.sendText(phone, `⚠️ ${result.message}`);
      await startSetPin(phone);
      return true;
    }
    await whatsapp.sendText(phone, '✅ *Transaction PIN set!*\n\nRequired before every purchase.');
    setSession(phone, {
      step: getSession(phone)?.activeService ? `${getSession(phone).activeService}_menu` : 'super_menu',
      data: { ...data, pinBuffer: [], pinDraft: null },
    });
    if (data.pendingPurchase) {
      const { resumePendingPurchase } = require('./pinGate');
      await resumePendingPurchase(phone, data.pendingPurchase);
    }
    return true;
  }

  if (step === 'pin_verify') {
    const result = await transactionPin.verifyPin(phone, pin);
    if (!result.ok) {
      await whatsapp.sendText(phone, `❌ ${result.message}`);
      if (!result.locked) {
        await startVerifyPin(phone, data.pendingPurchase);
      }
      return true;
    }
    setSession(phone, {
      ...getSession(phone),
      data: { ...data, pinBuffer: [], pinVerifiedAt: Date.now() },
    });
    const { resumePendingPurchase } = require('./pinGate');
    await resumePendingPurchase(phone, data.pendingPurchase);
    return true;
  }

  return false;
}

module.exports = {
  PIN_STEPS,
  isPinStep,
  startSetPin,
  startVerifyPin,
  handlePinChoice,
  handlePinText,
};
