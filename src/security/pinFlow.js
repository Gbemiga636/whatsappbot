/**
 * PIN flow — delegates to secure web portal.
 */

const pinPortal = require('./pinPortal');

async function promptSetPin(phone, opts = {}) {
  return pinPortal.promptSetPin(phone, opts);
}

async function promptVerifyPin(phone, pendingPurchase) {
  return pinPortal.promptVerifyPin(phone, pendingPurchase);
}

async function promptChangePin(phone) {
  return pinPortal.promptChangePin(phone);
}

module.exports = {
  promptSetPin,
  promptVerifyPin,
  promptChangePin,
};
