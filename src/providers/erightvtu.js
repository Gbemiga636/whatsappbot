/**
 * ERight VTU — Sabuss/Samora VTU API
 * Buy: POST https://sabuss.com/vtu/api/buy/{API_KEY}
 * Plans: POST https://sabuss.com/vtu/api/plans/{API_KEY}  (pin + category)
 * Fields: pin, plan_id, phone, amount, reference
 */

const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

const API_ROOT = (config.bills.erightvtu.baseUrl || 'https://sabuss.com/vtu/api').replace(/\/$/, '');

/** Fallback plan_id if plans API is unreachable (sample docs only — use API in production) */
const LEGACY_NETWORK_PLAN_IDS = {
  MTN: '1',
  AIRTEL: '2',
  GLO: '3',
  '9MOBILE': '4',
};

/** Sabuss plans API categories */
const DATA_PLANS_CATEGORY = 'data';
const AIRTIME_PLANS_CATEGORY = 'airtime';

const CABLE_PLAN_CATEGORIES = {
  dstv: ['dstv', 'cable', 'tv'],
  gotv: ['gotv', 'cable', 'tv'],
  startimes: ['startimes', 'cable', 'tv'],
};

const ELECTRICITY_PLAN_CATEGORIES = [
  'electricity',
  'electric',
  'utility',
  'power',
  'meter',
  'bill',
];

function normalizeNetworkKey(network) {
  const n = String(network || 'MTN').toUpperCase();
  if (n === '9MOBILE' || n === 'ETISALAT') return '9MOBILE';
  if (n === 'AIRTEL') return 'AIRTEL';
  if (n === 'GLO') return 'GLO';
  if (n === 'MTN') return 'MTN';
  return n;
}

const NETWORK_MATCHERS = {
  MTN: /\bMTN\b/i,
  AIRTEL: /\bAIRTEL\b/i,
  GLO: /\bGLO\b/i,
  '9MOBILE': /\b9MOBILE\b|\bETISALAT\b/i,
};

function getApiKey() {
  return config.bills.erightvtu.apiKey || null;
}

function getApiPin() {
  return config.bills.erightvtu.apiPin || '0000';
}

function getBillPlanMap() {
  return config.bills.erightvtu.billPlans || {};
}

function buildRef() {
  return `mysogi${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
}

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('234')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0')) return digits;
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

function endpoint(action) {
  const key = getApiKey();
  if (!key) return null;
  return `${API_ROOT}/${action}/${key}`;
}

function parseSabussResponse(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, message: 'Invalid response from ERight VTU', raw: data };
  }

  const status = String(data.status ?? '').toLowerCase();
  const code = String(data.code ?? '');

  if (status === 'error' || code === '800' || code === '400' || code === '401') {
    return {
      ok: false,
      message: data.response || data.message || data.msg || 'Transaction failed',
      raw: data,
    };
  }

  const success =
    status === 'success' ||
    code === '200' ||
    code === '201' ||
    code === '000' ||
    data.success === true ||
    /success/i.test(String(data.message || data.msg || data.response || ''));

  const message =
    data.response ||
    data.message ||
    data.msg ||
    data.description ||
    data.trueResponse ||
    (success ? 'TRANSACTION SUCCESSFUL' : 'Transaction failed');

  const transactionId =
    data.reference ||
    data.ref ||
    data.ourRef ||
    data.transaction_id ||
    data.transactionId ||
    data.id ||
    null;

  const token = data.token || data.Token || data.purchased_code || null;

  return {
    ok: success,
    message: String(message),
    transactionId,
    token,
    raw: data,
  };
}

async function postForm(action, fields) {
  const url = endpoint(action);
  if (!url) {
    return { ok: false, message: 'ERight VTU not configured. Add ERIGHT_VTU_API_KEY to .env.' };
  }

  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v != null && v !== '') body.append(k, String(v));
  }

  try {
    const { data, status } = await axios.post(url, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 45000,
      validateStatus: () => true,
    });

    if (typeof data === 'string' && data.includes('<!DOCTYPE')) {
      return {
        ok: false,
        message: `ERight VTU returned HTML (check API URL: ${API_ROOT}).`,
        httpStatus: status,
      };
    }

    if (Array.isArray(data)) {
      return { ok: true, plans: data, raw: data };
    }

    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return { ok: true, plans: parsed, raw: parsed };
        return parseSabussResponse(parsed);
      } catch {
        return { ok: false, message: data.slice(0, 200), raw: data };
      }
    }

    return parseSabussResponse(data);
  } catch (err) {
    return {
      ok: false,
      message: err.response?.data?.message || err.message,
      raw: err.response?.data,
    };
  }
}

function mapPlanRow(p) {
  return {
    planId: String(p.plan_id ?? p.plan ?? p.planId ?? p.id ?? ''),
    planName: p.name || p.title || p.planName || '',
    amount: Number(String(p.amount || '0').replace(/[^\d.]/g, '')) || 0,
    serviceId: String(p.serviceid ?? p.serviceId ?? ''),
    category: p.category || '',
  };
}

let dataPlansCache = { at: 0, plans: [] };
let airtimePlansCache = { at: 0, plans: [] };
const CACHE_MS = 5 * 60 * 1000;

async function fetchPlans(category) {
  const key = getApiKey();
  if (!key) return [];

  const result = await postForm('plans', { pin: getApiPin(), category });
  if (result.plans?.length) {
    return result.plans.map(mapPlanRow).filter((p) => p.planId);
  }

  // Legacy GET fallback (public catalog — often empty on Sabuss)
  try {
    const { data } = await axios.get(`${API_ROOT}/?category=${encodeURIComponent(category)}`, {
      timeout: 20000,
      validateStatus: () => true,
    });
    const rows = Array.isArray(data) ? data : data?.plans || data?.data || [];
    return rows.map(mapPlanRow).filter((p) => p.planId);
  } catch {
    return [];
  }
}

async function fetchDataPlans() {
  const now = Date.now();
  if (dataPlansCache.plans.length && now - dataPlansCache.at < CACHE_MS) {
    return dataPlansCache.plans;
  }
  const plans = await fetchPlans(DATA_PLANS_CATEGORY);
  dataPlansCache = { at: now, plans };
  return plans;
}

async function fetchAirtimePlans() {
  const now = Date.now();
  if (airtimePlansCache.plans.length && now - airtimePlansCache.at < CACHE_MS) {
    return airtimePlansCache.plans;
  }
  const plans = await fetchPlans(AIRTIME_PLANS_CATEGORY);
  airtimePlansCache = { at: now, plans };
  return plans;
}

async function resolveAirtimePlan(network) {
  const net = normalizeNetworkKey(network);
  const plans = await fetchAirtimePlans();
  const matched = filterPlansByNetwork(plans, net)[0];

  if (matched?.planId) {
    return { ok: true, planId: matched.planId, planName: matched.planName };
  }

  const legacyId = LEGACY_NETWORK_PLAN_IDS[net];
  if (legacyId) {
    return { ok: true, planId: legacyId, planName: `${net} Airtime`, legacy: true };
  }

  return {
    ok: false,
    message: `No airtime plan found for ${network}. Check ERight VTU airtime products.`,
  };
}

function filterPlansByNetwork(plans, network) {
  const net = normalizeNetworkKey(network);
  const matcher = NETWORK_MATCHERS[net];
  if (!matcher) return plans;
  return plans.filter((p) => matcher.test(p.planName));
}

function extractDataSize(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(gb|mb)/i);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2].toLowerCase();
  return { value, unit, key: `${value}${unit}` };
}

function matchDataPlan(plans, planText) {
  if (!planText || !plans.length) return null;

  const needle = String(planText).toLowerCase().replace(/\s+/g, '');
  const size = extractDataSize(planText);

  const byId = plans.find((p) => p.planId.toLowerCase() === needle);
  if (byId) return byId;

  if (size) {
    const sizeNeedle = `${size.value}${size.unit}`;
    const bySize = plans.find((p) => {
      const name = p.planName.toLowerCase().replace(/\s+/g, '');
      return name.includes(sizeNeedle) || name.includes(`${size.value} ${size.unit}`);
    });
    if (bySize) return bySize;
  }

  const byName = plans.find((p) => {
    const name = p.planName.toLowerCase().replace(/\s+/g, '');
    return name.includes(needle) || needle.includes(name);
  });
  if (byName) return byName;

  return null;
}

async function resolveDataPlan(network, planText) {
  const all = await fetchDataPlans();
  const scoped = filterPlansByNetwork(all, network);
  const matched = matchDataPlan(scoped.length ? scoped : all, planText);

  if (!matched) {
    const samples = scoped.slice(0, 5).map((p) => p.planName).join(', ');
    return {
      ok: false,
      message: `Data plan "${planText || 'unknown'}" not found for ${network}.` +
        (samples ? ` Try: ${samples}` : ''),
    };
  }

  return {
    ok: true,
    planId: matched.planId,
    planName: matched.planName,
    amount: matched.amount,
  };
}

async function fetchPlansForCategories(categories) {
  for (const category of categories) {
    const plans = await fetchPlans(category);
    if (plans.length) return { category, plans };
  }
  return { category: null, plans: [] };
}

function resolveBillPlanId(billType, hint) {
  const map = getBillPlanMap();
  const typeKey = String(billType || '').toLowerCase();

  if (typeKey === 'electricity') {
    const disco = String(hint || 'IKEDC').toUpperCase();
    return map.electricity?.[disco] || map.electricity?.[disco.toLowerCase()] || null;
  }

  const cableMap = map[typeKey];
  if (!cableMap) return null;

  if (typeof cableMap === 'string') return cableMap;

  const amount = Number(hint);
  if (amount && cableMap.byAmount?.[String(amount)]) {
    return cableMap.byAmount[String(amount)];
  }

  if (hint && cableMap[hint]) return cableMap[hint];
  return cableMap.default || null;
}

async function purchaseAirtime({ network, phone, amount, type, plan }) {
  if (!getApiKey()) {
    return {
      ok: true,
      message: `[Demo] ${type} purchased: ${network} ${phone}. Add ERIGHT_VTU_API_KEY.`,
      simulated: true,
    };
  }

  const net = normalizeNetworkKey(network);
  const normalizedPhone = normalizePhone(phone);
  const ref = buildRef();

  if (type === 'data') {
    const resolved = await resolveDataPlan(net, plan);
    if (!resolved.ok) return resolved;

    return postForm('buy', {
      pin: getApiPin(),
      plan_id: resolved.planId,
      phone: normalizedPhone,
      amount: resolved.amount || amount || 0,
      reference: ref,
    });
  }

  const airtimePlan = await resolveAirtimePlan(net);
  if (!airtimePlan.ok) return airtimePlan;

  return postForm('buy', {
    pin: getApiPin(),
    plan_id: airtimePlan.planId,
    phone: normalizedPhone,
    amount: Number(amount) || 100,
    reference: ref,
  });
}

async function payBill(bill) {
  if (!getApiKey()) {
    return {
      ok: true,
      message: `[Demo] ${bill.type} bill paid — ${bill.amount}. Add ERIGHT_VTU_API_KEY.`,
      token: '1234-5678-9012-3456',
      simulated: true,
    };
  }

  const ref = buildRef();
  const billType = String(bill.type || '').toLowerCase();

  if (billType === 'electricity') {
    const disco = String(bill.provider || 'IKEDC').toUpperCase();
    const { plans } = await fetchPlansForCategories([
      disco.toLowerCase(),
      ...ELECTRICITY_PLAN_CATEGORIES,
    ]);

    const envPlanId = resolveBillPlanId('electricity', disco);
    const matched =
      plans.find((p) => p.planName.toUpperCase().includes(disco)) ||
      (envPlanId ? { planId: envPlanId, amount: Number(bill.amount) } : null);

    if (!matched?.planId) {
      return {
        ok: false,
        fallback: 'vtpass',
        message:
          `Electricity (${disco}) is not enabled on your ERight VTU API account. ` +
          'Falling back to VTPass if configured.',
      };
    }

    return postForm('buy', {
      pin: getApiPin(),
      plan_id: matched.planId,
      phone: String(bill.meter),
      amount: Number(bill.amount),
      reference: ref,
    });
  }

  const cableCategories = CABLE_PLAN_CATEGORIES[billType];
  if (!cableCategories) {
    return { ok: false, message: `Bill type "${bill.type}" is not supported on ERight VTU.` };
  }

  const { plans } = await fetchPlansForCategories(cableCategories);
  const target = Number(bill.amount);
  const smartcard = bill.smartcard || bill.meter;

  let bouquet =
    plans.find((p) => p.amount === target) ||
    plans.reduce((best, p) => {
      if (!p.amount) return best;
      const diff = Math.abs(p.amount - target);
      const bestDiff = best ? Math.abs(best.amount - target) : Infinity;
      return diff < bestDiff ? p : best;
    }, null);

  const envPlanId = resolveBillPlanId(billType, String(target));
  if (!bouquet && envPlanId) {
    bouquet = { planId: envPlanId, amount: target };
  }

  if (!bouquet?.planId) {
    return {
      ok: false,
      fallback: 'vtpass',
      message:
        `No ${bill.type} packages found on your ERight VTU API account. ` +
        'Falling back to VTPass if configured.',
    };
  }

  return postForm('buy', {
    pin: getApiPin(),
    plan_id: bouquet.planId,
    phone: smartcard,
    amount: bouquet.amount || target,
    reference: ref,
  });
}

async function getBalance() {
  const result = await postForm('balance', { pin: getApiPin() });
  if (!result.ok) return result;

  const balance =
    result.raw?.balance ??
    result.raw?.wallet ??
    result.raw?.data?.balance ??
    result.raw?.description?.balance;

  if (balance == null) {
    return { ok: true, balance: 0, raw: result.raw, message: 'Balance check OK' };
  }

  return { ok: true, balance: Number(balance), raw: result.raw };
}

module.exports = {
  purchaseAirtime,
  payBill,
  getBalance,
  fetchPlans,
  fetchDataPlans,
  fetchAirtimePlans,
  resolveDataPlan,
  resolveAirtimePlan,
  buildRef,
};
