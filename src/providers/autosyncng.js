/**
 * AutoSyncNG VTU API
 * Docs: https://autosyncng.com/user/developer/docs
 *
 * Auth: Authorization: Bearer {API_KEY}
 * Base:  https://autosyncng.com/api/v1/
 */

const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

const API_ROOT = (config.bills.autosyncng.baseUrl || 'https://autosyncng.com/api/v1').replace(/\/$/, '');

const NETWORK_CODES = {
  MTN: 'mtn',
  AIRTEL: 'airtel',
  GLO: 'glo',
  '9MOBILE': '9mobile',
};

const CABLE_CODES = {
  dstv: 'dstv',
  gotv: 'gotv',
  startimes: 'startimes',
};

const DISCO_CODES = {
  IKEDC: 'ikeja',
  EKEDC: 'eko',
  EEDC: 'enugu',
  IBEDC: 'ibadan',
  JED: 'jos',
  JEDPLC: 'jos',
  KAEDC: 'kaduna',
  KEDCO: 'kano',
  PHED: 'portharcourt',
  PORT: 'portharcourt',
  AEDC: 'abuja',
  YEDC: 'yola',
  BEDC: 'benin',
};

let catalogCache = { at: 0, airtime: null, data: null, dataSme: null, electricity: null, cable: null, betting: null };
const CACHE_MS = 5 * 60 * 1000;

function getApiKey() {
  return config.bills.autosyncng.apiKey || null;
}

function getPin() {
  return config.bills.autosyncng.apiPin || '';
}

function buildRef() {
  return `Bygate${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
}

function normalizeNetworkKey(network) {
  const n = String(network || 'MTN').toUpperCase();
  if (n === '9MOBILE' || n === 'ETISALAT') return '9MOBILE';
  if (n === 'AIRTEL') return 'AIRTEL';
  if (n === 'GLO') return 'GLO';
  if (n === 'MTN') return 'MTN';
  return n;
}

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('234')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0')) return digits;
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

function getHeaders() {
  const key = getApiKey();
  if (!key) return null;
  return {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function friendlyFailureMessage(message) {
  const text = String(message || '').trim();
  if (/no gateway found/i.test(text)) {
    return (
      'This service is not active on our VTU supplier yet (gateway not connected). ' +
      'Try another service or contact Bygate support.'
    );
  }
  return text || 'Transaction failed — check AutoSyncNG wallet balance and API PIN';
}

function extractMessage(data) {
  const parts = [
    data?.message,
    data?.data?.message,
    data?.data?.transaction?.details,
    data?.data?.transaction?.message,
    data?.error,
    typeof data?.errors === 'string' ? data.errors : null,
    Array.isArray(data?.errors) ? data.errors.join(', ') : null,
  ].filter(Boolean);

  const text = parts.map((p) => String(p).trim()).find((p) => p.length > 0);
  return text || '';
}

function parseResponse(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, message: 'Invalid response from AutoSyncNG', raw: data };
  }

  const topStatus = String(data.status ?? '').toLowerCase();
  const tx = data.data?.transaction;
  const txStatus = String(tx?.status ?? '').toLowerCase();
  const text = extractMessage(data);

  const success = topStatus === 'ok' && (txStatus === 'successful' || txStatus === 'success');
  const pending = topStatus === 'ok' && txStatus === 'pending';

  if (success || pending) {
    return {
      ok: true,
      message: text || tx?.details || 'Transaction successful',
      transactionId: tx?.reference || tx?.request_ref || null,
      token: tx?.token && tx.token !== 'successful' ? tx.token : null,
      pendingWebhook: pending,
      raw: data,
    };
  }

  const failReason = friendlyFailureMessage(
    text ||
      (topStatus && topStatus !== 'ok' ? `Provider returned status: ${topStatus}` : '') ||
      (txStatus ? `Transaction status: ${txStatus}` : '')
  );

  return {
    ok: false,
    message: failReason,
    gatewayMissing: /no gateway found/i.test(text),
    transactionId: tx?.reference || tx?.request_ref || null,
    raw: data,
  };
}

async function request(method, path, body) {
  const headers = getHeaders();
  if (!headers) {
    return { ok: false, message: 'AutoSyncNG not configured. Add AUTOSYNCNG_API_KEY to .env.' };
  }

  try {
    const { data, status } = await axios({
      method,
      url: `${API_ROOT}${path}`,
      headers,
      data: body,
      timeout: 45000,
      validateStatus: () => true,
    });

    if (typeof data === 'string' && data.includes('<!DOCTYPE')) {
      return { ok: false, message: `AutoSyncNG returned HTML (check API URL: ${API_ROOT}).`, httpStatus: status };
    }

    return parseResponse(data);
  } catch (err) {
    return {
      ok: false,
      message: err.response?.data?.message || err.message,
      raw: err.response?.data,
    };
  }
}

async function fetchCatalog(path) {
  const headers = getHeaders();
  if (!headers) return null;

  try {
    const { data } = await axios.get(`${API_ROOT}${path}`, { headers, timeout: 20000, validateStatus: () => true });
    if (data?.status === 'ok') return data.data?.category || null;
  } catch {
    return null;
  }
  return null;
}

async function getCatalogs() {
  const now = Date.now();
  if (catalogCache.at && now - catalogCache.at < CACHE_MS) return catalogCache;

  const [airtime, data, dataSme, electricity, cable, betting] = await Promise.all([
    fetchCatalog('/airtime'),
    fetchCatalog('/data'),
    fetchCatalog('/data/sme'),
    fetchCatalog('/electricity'),
    fetchCatalog('/cable'),
    fetchCatalog('/betting'),
  ]);

  catalogCache = { at: now, airtime, data, dataSme, electricity, cable, betting };
  return catalogCache;
}

function findProductByCode(category, code) {
  const products = category?.products || [];
  const needle = String(code || '').toLowerCase();
  return products.find((p) => String(p.code || '').toLowerCase() === needle) || null;
}

function findAirtimeProduct(network) {
  const net = normalizeNetworkKey(network);
  const code = NETWORK_CODES[net];
  if (!code || !catalogCache.airtime) return null;
  return findProductByCode(catalogCache.airtime, code);
}

function extractDataSize(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(gb|mb)/i);
  if (!m) return null;
  return `${Number(m[1])}${m[2].toLowerCase()}`;
}

function matchVariation(variations, planText) {
  if (!variations?.length) return null;

  const needle = String(planText || '').toLowerCase().replace(/\s+/g, '');
  const size = extractDataSize(planText);

  const byCode = variations.find((v) => String(v.code || '').toLowerCase().replace(/\s+/g, '') === needle);
  if (byCode) return byCode;

  if (/^\d+$/.test(needle)) {
    const byId = variations.find((v) => String(v.id) === needle);
    if (byId) return byId;
  }

  if (size) {
    const bySize = variations.find((v) => {
      const name = String(v.name || '').toLowerCase().replace(/\s+/g, '');
      return name.includes(size);
    });
    if (bySize) return bySize;
  }

  return (
    variations.find((v) => {
      const name = String(v.name || '').toLowerCase().replace(/\s+/g, '');
      return name.includes(needle) || needle.includes(name);
    }) || null
  );
}

function collectDataPlans(network) {
  const net = normalizeNetworkKey(network);
  const code = NETWORK_CODES[net];
  const plans = [];

  for (const [dataType, category] of [
    ['gifting', catalogCache.data],
    ['sme', catalogCache.dataSme],
  ]) {
    const product = findProductByCode(category, code);
    if (!product?.variations?.length) continue;

    for (const v of product.variations) {
      const amount = Number(v.amount) || 0;
      if (!amount) continue;
      plans.push({
        planId: String(product.id),
        variationCode: v.code,
        planName: v.name,
        amount: amount,
        dataType,
        network: net,
      });
    }
  }

  return plans;
}

async function fetchDataPlans(network) {
  await getCatalogs();
  return network ? collectDataPlans(network) : Object.keys(NETWORK_CODES).flatMap((n) => collectDataPlans(n));
}

async function resolveDataPlan(network, planText) {
  await getCatalogs();
  const net = normalizeNetworkKey(network);
  const code = NETWORK_CODES[net];

  for (const [dataType, category] of [
    ['gifting', catalogCache.data],
    ['sme', catalogCache.dataSme],
  ]) {
    const product = findProductByCode(category, code);
    const variation = matchVariation(product?.variations, planText);
    if (!product || !variation) continue;

    const amount = Number(variation.amount) || 0;
    if (!amount) {
      return {
        ok: false,
        message: `Plan "${variation.name}" has no price on AutoSyncNG. Pick another bundle.`,
      };
    }

    return {
      ok: true,
      planId: String(product.id),
      variationCode: variation.code,
      planName: variation.name,
      amount,
      dataType,
    };
  }

  const plans = collectDataPlans(network);
  const samples = plans.slice(0, 5).map((p) => p.planName).join(', ');
  return {
    ok: false,
    message:
      `Data plan "${planText || 'unknown'}" not found for ${network}.` +
      (samples ? ` Try: ${samples}` : ''),
  };
}

function requirePin() {
  if (!getPin()) {
    return { ok: false, message: 'AutoSyncNG transaction PIN not set. Add AUTOSYNCNG_API_PIN to .env.' };
  }
  return null;
}

async function purchaseAirtime({ network, phone, amount, type, plan, resolvedPlan }) {
  if (!getApiKey()) {
    return {
      ok: true,
      message: `[Demo] ${type} purchased: ${network} ${phone}. Add AUTOSYNCNG_API_KEY.`,
      simulated: true,
    };
  }

  const pinErr = requirePin();
  if (pinErr) return pinErr;

  await getCatalogs();
  const normalizedPhone = normalizePhone(phone);
  const requestRef = buildRef();

  if (type === 'data') {
    const resolved = resolvedPlan?.ok ? resolvedPlan : await resolveDataPlan(network, plan);
    if (!resolved.ok) return resolved;

    const path = resolved.dataType === 'sme' ? '/data/sme' : '/data';
    return request('POST', path, {
      request_ref: requestRef,
      phone: normalizedPhone,
      product_id: resolved.planId,
      variation_code: resolved.variationCode,
      ported_no: true,
      pin: getPin(),
    });
  }

  const product = findAirtimeProduct(network);
  if (!product?.id) {
    return { ok: false, message: `No airtime product found for ${network} on AutoSyncNG.` };
  }

  return request('POST', '/airtime', {
    request_ref: requestRef,
    phone: normalizedPhone,
    product_id: product.id,
    amount: String(Number(amount) || 100),
    ported_no: true,
    pin: getPin(),
  });
}

function resolveElectricityProduct(provider) {
  const disco = String(provider || 'IKEDC').toUpperCase().replace(/[^A-Z]/g, '');
  const code = DISCO_CODES[disco] || String(provider || '').toLowerCase();
  return findProductByCode(catalogCache.electricity, code);
}

function resolveCableProduct(billType) {
  const code = CABLE_CODES[String(billType || '').toLowerCase()];
  if (!code) return null;
  return findProductByCode(catalogCache.cable, code);
}

function findCableVariation(product, amount) {
  const target = Number(amount);
  const variations = product?.variations || [];
  if (!variations.length) return null;

  const exact = variations.find((v) => Number(v.amount) === target);
  if (exact) return exact;

  return variations.reduce((best, v) => {
    if (!v.amount) return best;
    const diff = Math.abs(Number(v.amount) - target);
    const bestDiff = best ? Math.abs(Number(best.amount) - target) : Infinity;
    return diff < bestDiff ? v : best;
  }, null);
}

async function payBill(bill) {
  if (!getApiKey()) {
    return {
      ok: true,
      message: `[Demo] ${bill.type} bill paid — ${bill.amount}. Add AUTOSYNCNG_API_KEY.`,
      token: '1234-5678-9012-3456',
      simulated: true,
    };
  }

  const pinErr = requirePin();
  if (pinErr) return pinErr;

  await getCatalogs();
  const requestRef = buildRef();
  const billType = String(bill.type || '').toLowerCase();

  if (billType === 'electricity') {
    const product = bill.productId
      ? { id: bill.productId }
      : resolveElectricityProduct(bill.provider);
    if (!product?.id) {
      return {
        ok: false,
        message: `Electricity provider "${bill.provider}" not found on AutoSyncNG.`,
      };
    }

    return request('POST', '/electricity', {
      request_ref: requestRef,
      meter_number: String(bill.meter),
      product_id: product.id,
      type: bill.meterType || 'prepaid',
      amount: String(Number(bill.amount)),
      pin: getPin(),
    });
  }

  const cableTypes = ['dstv', 'gotv', 'startimes'];
  if (cableTypes.includes(billType)) {
    const product = resolveCableProduct(billType);
    if (!product?.id) {
      return { ok: false, message: `Cable provider "${billType}" not found on AutoSyncNG.` };
    }

    const smartcard = bill.smartcard || bill.meter;
    const amount = Number(bill.variation?.amount || bill.amount);
    const variationCode = bill.variationCode || bill.variation?.variationCode || 'none';

    return request('POST', '/cable', {
      request_ref: requestRef,
      iuc_number: String(smartcard),
      product_id: bill.productId || product.id,
      variation_code: variationCode,
      type: bill.cableAction || 'renew',
      amount: String(amount),
      pin: getPin(),
    });
  }

  if (billType === 'betting') {
    return purchaseBetting({
      productId: bill.productId,
      customerId: bill.customerId,
      amount: bill.amount,
    });
  }

  return { ok: false, message: `Bill type "${bill.type}" is not supported on AutoSyncNG.` };
}

async function purchaseBetting({ productId, customerId, amount }) {
  if (!getApiKey()) {
    return {
      ok: true,
      message: `[Demo] Betting top-up ₦${amount}. Add AUTOSYNCNG_API_KEY.`,
      simulated: true,
    };
  }

  const pinErr = requirePin();
  if (pinErr) return pinErr;

  return request('POST', '/betting', {
    request_ref: buildRef(),
    customer_id: String(customerId),
    product_id: productId,
    amount: String(Number(amount)),
    pin: getPin(),
  });
}

async function getElectricityDiscos() {
  await getCatalogs();
  return (catalogCache.electricity?.products || []).map((p) => ({
    id: String(p.id),
    name: p.name,
    code: p.code,
  }));
}

async function getBettingBookmakers() {
  await getCatalogs();
  return (catalogCache.betting?.products || []).map((p) => ({
    id: String(p.id),
    name: p.name,
    code: p.code,
  }));
}

async function getCablePackages(billType) {
  await getCatalogs();
  const product = resolveCableProduct(billType);
  if (!product) return [];
  return (product.variations || [])
    .filter((v) => Number(v.amount) > 0)
    .map((v) => ({
      productId: String(product.id),
      variationCode: v.code,
      name: v.name,
      amount: Number(v.amount),
    }));
}

async function getBalance() {
  const headers = getHeaders();
  if (!headers) return { ok: false, message: 'AutoSyncNG not configured' };

  try {
    const { data } = await axios.get(`${API_ROOT}/me`, { headers, timeout: 15000, validateStatus: () => true });
    if (data?.status !== 'ok') {
      return { ok: false, message: data?.message || 'Balance check failed', raw: data };
    }

    const balance = Number(
      data.data?.user?.wallet?.balance ??
        data.data?.user?.wallet?.spendable_balance ??
        data.data?.user?.wallet_balance ??
        0
    );

    return { ok: true, balance, raw: data, message: 'Balance check OK' };
  } catch (err) {
    return {
      ok: false,
      message: err.response?.data?.message || err.message,
      raw: err.response?.data,
    };
  }
}

module.exports = {
  purchaseAirtime,
  payBill,
  purchaseBetting,
  getBalance,
  fetchDataPlans,
  resolveDataPlan,
  getElectricityDiscos,
  getBettingBookmakers,
  getCablePackages,
  buildRef,
  getCatalogs,
};
