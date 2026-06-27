/**
 * Telecom / bills provider router — switch via .env
 *
 * BILLS_PROVIDER=clubkonnect → ClubKonnect (airtime, data, electricity, cable, betting)
 * BILLS_PROVIDER=autosyncng  → AutoSyncNG
 * BILLS_PROVIDER=vtpass      → VTPass
 */

const config = require('../config');
const vtpass = require('./vtpass');
const autosyncng = require('./autosyncng');
const clubkonnect = require('./clubkonnect');

function getProviderName() {
  return (config.bills.provider || 'vtpass').toLowerCase();
}

function getProvider() {
  const name = getProviderName();
  if (name === 'clubkonnect') return clubkonnect;
  if (name === 'autosyncng') return autosyncng;
  return vtpass;
}

function vtpassConfigured() {
  return !!(config.bills.vtpass.apiKey && config.bills.vtpass.secretKey);
}

function providerActive(name) {
  return getProviderName() === name;
}

async function purchaseAirtime(opts) {
  return getProvider().purchaseAirtime(opts);
}

async function resolveDataPlan(network, planText) {
  if (providerActive('clubkonnect') || providerActive('autosyncng')) {
    return getProvider().resolveDataPlan(network, planText);
  }
  return { ok: true, amount: 500, planName: planText, planId: planText };
}

async function fetchDataPlans(network) {
  if (providerActive('clubkonnect') || providerActive('autosyncng')) {
    return getProvider().fetchDataPlans(network);
  }
  return [];
}

async function getElectricityDiscos() {
  if (providerActive('clubkonnect') || providerActive('autosyncng')) {
    return getProvider().getElectricityDiscos();
  }
  return [];
}

async function getBettingBookmakers() {
  if (providerActive('clubkonnect') || providerActive('autosyncng')) {
    return getProvider().getBettingBookmakers();
  }
  return [];
}

async function getCablePackages(billType) {
  if (providerActive('clubkonnect') || providerActive('autosyncng')) {
    return getProvider().getCablePackages(billType);
  }
  return [];
}

async function payBill(bill) {
  if (providerActive('autosyncng')) {
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

  return getProvider().payBill(bill);
}

async function getBalance() {
  return getProvider().getBalance();
}

module.exports = {
  getProviderName,
  purchaseAirtime,
  resolveDataPlan,
  fetchDataPlans,
  getElectricityDiscos,
  getBettingBookmakers,
  getCablePackages,
  payBill,
  getBalance,
};
