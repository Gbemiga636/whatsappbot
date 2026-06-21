/**
 * PIN entry mode picker — type all 4 digits at once, or secure keypad.
 */

const whatsapp = require('../whatsapp');
const { setSession, getSession } = require('../sessionStore');
const pinPad = require('./pinPad');
const pinQuick = require('./pinQuick');
const config = require('../config');

const CHOOSE_STEP = 'pin_choose_mode';

function shouldAskMode() {
  const mode = config.security?.pinEntryMode || 'ask';
  return mode === 'ask';
}

function isChooseModeStep(step) {
  return step === CHOOSE_STEP;
}

async function showPinModeChoice(phone, { purpose, pendingPurchase } = {}) {
  const session = getSession(phone) || { step: 'idle', data: {} };
  setSession(phone, {
    ...session,
    step: CHOOSE_STEP,
    data: {
      ...session.data,
      pinPurpose: purpose,
      pendingPurchase: pendingPurchase ?? session.data?.pendingPurchase ?? null,
    },
  });

  const action =
    purpose === 'verify'
      ? 'authorize this purchase'
      : purpose === 'change'
        ? 'set your new PIN'
        : 'create your PIN';

  await whatsapp.sendButtons(
    phone,
    `🔐 *Enter PIN*\n\nHow do you want to ${action}?\n\n` +
      '• *Type all 4 digits* — one message, fastest\n' +
      '• *Secure keypad* — tap digit-by-digit, hidden in chat',
    [
      { id: 'pin_mode_type', title: 'Type all 4 digits' },
      { id: 'pin_mode_keypad', title: 'Secure keypad' },
    ]
  );
}

async function handleModeChoice(phone, choice, session) {
  if (choice !== 'pin_mode_type' && choice !== 'pin_mode_keypad') return false;

  const data = session.data || {};
  const purpose = data.pinPurpose || 'set';
  const pendingPurchase = data.pendingPurchase;

  if (choice === 'pin_mode_type') {
    if (purpose === 'verify') {
      await pinQuick.startQuickVerifyPin(phone, pendingPurchase);
    } else {
      await pinQuick.startQuickSetPin(phone, { pendingPurchase });
    }
    return true;
  }

  if (purpose === 'verify') {
    await pinPad.startVerifyPin(phone, pendingPurchase);
  } else {
    await pinPad.startSetPin(phone, { pendingPurchase });
  }
  return true;
}

module.exports = {
  shouldAskMode,
  isChooseModeStep,
  showPinModeChoice,
  handleModeChoice,
};
