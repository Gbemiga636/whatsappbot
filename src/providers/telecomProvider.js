/**
 * Telecom / bills provider router — switch via .env
 *
 * BILLS_PROVIDER=autosyncng → AutoSyncNG (airtime, data, electricity, cable)
 * BILLS_PROVIDER=vtpass      → VTPass (all services)
 */

const config = require('../config');
const vtpass = require('./vtpass');
const autosyncng = require('./autosyncng');

function getProviderName() {
  return (config.bills.provider || 'vtpass').toLowerCase();
}

function getProvider() {
  return getProviderName() === 'autosyncng' ? autosyncng : vtpass;
}

function vtpassConfigured() {
  return !!(config.bills.vtpass.apiKey && config.bills.vtpass.secretKey);
}

async function purchaseAirtime(opts) {
  return getProvider().purchaseAirtime(opts);
}

async function resolveDataPlan(network, planText) {
  if (getProviderName() === 'autosyncng') {
    return autosyncng.resolveDataPlan(network, planText);
  }
  return { ok: true, amount: 500, planName: planText, planId: planText };
}

async function payBill(bill) {
  if (getProviderName() === 'autosyncng') {
    const result = await autosyncng.payBill(bill);
    if (!result.ok && result.fallback === 'vtpass' && vtpassConfigured()) {
      const vtResult = await vtpass.payBill(bill);
      if (vtResult.ok) {
        return { ...vtResult, provider: 'vtpass', message: vtResult.message };
      }
      return {
        ok: false,
        message:
          `${result.message} VTPass fallback also failed: ${vtResult.message || 'check VTPass keys and IP whitelist'}.`,
        raw: vtResult.raw,
      };
    }
    return result;
  }
  return vtpass.payBill(bill);
}

async function getBalance() {
  return getProvider().getBalance();
}

module.exports = {
  getProviderName,
  purchaseAirtime,
  resolveDataPlan,
  payBill,
  getBalance,
};
