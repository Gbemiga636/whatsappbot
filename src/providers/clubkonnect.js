/**
 * ClubKonnect VTU API (Nellobyte Systems)
 * Docs: https://www.clubkonnect.com/apidocs.asp
 *
 * Auth: UserID + APIKey query params on HTTPS GET
 * Base: https://www.nellobytesystems.com/
 */

const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

const API_ROOT = (
  config.bills.clubkonnect.baseUrl || 'https://www.nellobytesystems.com'
).replace(/\/$/, '');

const NETWORK_CODES = {
  MTN: '01',
  GLO: '02',
  '9MOBILE': '03',
  ETISALAT: '03',
  AIRTEL: '04',
};

const CODE_TO_NETWORK = Object.fromEntries(
  Object.entries(NETWORK_CODES).filter(([k]) => k !== 'ETISALAT').map(([k, v]) => [v, k])
);

const DISCO_CODES = {
  EKEDC: '01',
  IKEDC: '02',
  AEDC: '03',
  KEDCO: '04',
  KEDC: '04',
  PHED: '05',
  PHEDC: '05',
  JED: '06',
  JEDC: '06',
  IBEDC: '07',
  KAEDC: '08',
  EEDC: '09',
};

const CABLE_CODES = {
  dstv: 'dstv',
  gotv: 'gotv',
  startimes: 'startimes',
};

const BETTING_COMPANIES = [
  { id: 'sportybet', name: 'Sporty Bet', code: 'SportyBet' },
  { id: '1xbet', name: '1xBet', code: '1xBet' },
  { id: 'livescorebet', name: 'LiveScoreBet', code: 'LiveScoreBet' },
  { id: 'betland', name: 'BetLand', code: 'BetLand' },
  { id: 'naijabet', name: 'NaijaBet', code: 'NaijaBet' },
];

const SUCCESS_CODES = new Set([100, 200, 201, 300]);
const PENDING_CODES = new Set([100, 300, 600, 601, 602, 603, 604, 605, 606]);

let catalogCache = { at: 0, dataPlans: null, electricity: null, cable: null };
const CACHE_MS = 5 * 60 * 1000;

function getUserId() {
  return config.bills.clubkonnect.userId || null;
}

function getApiKey() {
  return config.bills.clubkonnect.apiKey || null;
}

function buildRef() {
  return `mysogi${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
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

function callbackUrl() {
  return config.publicBaseUrl ? `${config.publicBaseUrl}/webhook/clubkonnect` : '';
}

function parseStatusCode(data) {
  const raw = data?.statuscode ?? data?.statusCode ?? data?.status_code;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function friendlyFailureMessage(message, statusCode) {
  const text = String(message || '').trim();
  if (/invalid_credentials/i.test(text) || statusCode === 400) {
    return 'Invalid ClubKonnect credentials. Check CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY in .env.';
  }
  if (/insufficient_balance/i.test(text) || statusCode === 417) {
    return 'ClubKonnect wallet balance is too low. Fund your account at clubkonnect.com.';
  }
  if (/minimum_100/i.test(text) || statusCode === 407) {
    return 'Minimum airtime on ClubKonnect is ₦100.';
  }
  if (/ip/i.test(text) && /whitelist/i.test(text)) {
    return 'Server IP not whitelisted on ClubKonnect. Whitelist your host IP in the ClubKonnect dashboard.';
  }
  return text || 'Transaction failed';
}

function isCatalogPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return Array.isArray(data);
  if (data.balance != null) return false;
  const keys = Object.keys(data).map((k) => k.toLowerCase());
  return keys.some((k) =>
    ['mtn', 'glo', 'airtel', 'etisalat', '9mobile', 'products', 'dataplans', 'plans', 'dstv', 'gotv', 'mobile_network'].some(
      (n) => k.includes(n)
    )
  );
}

function parseResponse(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, message: 'Invalid response from ClubKonnect', raw: data };
  }

  if (data.balance != null && !parseStatusCode(data) && !String(data.status || '').match(/INVALID/i)) {
    const balance = Number(String(data.balance).replace(/,/g, ''));
    if (Number.isFinite(balance)) {
      return { ok: true, balance, message: 'Balance check OK', raw: data };
    }
  }

  if (isCatalogPayload(data)) {
    return { ok: true, message: 'Catalog loaded', raw: data };
  }

  const statusCode = parseStatusCode(data);
  const status = String(data.status || '').toUpperCase();
  const remark = String(data.remark || data.Remark || '');
  const description = String(
    data.description || data.Description || data.message || remark || status
  );
  const orderId = data.orderid || data.orderId || data.OrderID || null;
  const token = data.token || data.metertoken || data.Token || data.metertoken || null;

  if (statusCode != null && SUCCESS_CODES.has(statusCode)) {
    return {
      ok: true,
      message: description || remark || 'Transaction successful',
      transactionId: orderId,
      token: token && token !== 'successful' ? token : null,
      pendingWebhook: PENDING_CODES.has(statusCode) && statusCode !== 200 && statusCode !== 201,
      raw: data,
    };
  }

  if (/INVALID_CREDENTIALS/i.test(status) || /INVALID_CREDENTIALS/i.test(remark)) {
    return {
      ok: false,
      message: friendlyFailureMessage('INVALID_CREDENTIALS', 400),
      raw: data,
    };
  }

  return {
    ok: false,
    message: friendlyFailureMessage(description || remark, statusCode),
    transactionId: orderId,
    raw: data,
  };
}

async function request(endpoint, params = {}) {
  const userId = getUserId();
  const apiKey = getApiKey();
  if (!userId || !apiKey) {
    return {
      ok: false,
      message: 'ClubKonnect not configured. Set CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY in .env.',
    };
  }

  const query = new URLSearchParams({
    UserID: userId,
    APIKey: apiKey,
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, v == null ? '' : String(v)])
    ),
  });

  const path = endpoint.endsWith('.asp') ? endpoint : `${endpoint}.asp`;
  const url = `${API_ROOT}/${path}?${query.toString()}`;

  try {
    const { data, status } = await axios.get(url, {
      timeout: 45000,
      validateStatus: () => true,
      transformResponse: [(body) => {
        if (typeof body !== 'string') return body;
        try {
          return JSON.parse(body);
        } catch {
          return body;
        }
      }],
    });

    if (typeof data === 'string' && data.includes('<!DOCTYPE')) {
      return { ok: false, message: `ClubKonnect returned HTML (check API URL: ${API_ROOT}).`, httpStatus: status };
    }

    return parseResponse(data);
  } catch (err) {
    return {
      ok: false,
      message: err.response?.data?.description || err.response?.data?.message || err.message,
      raw: err.response?.data,
    };
  }
}

function networkCode(network) {
  return NETWORK_CODES[normalizeNetworkKey(network)] || null;
}

function networkLabelFromKey(key) {
  const k = String(key || '').trim();
  if (CODE_TO_NETWORK[k]) return CODE_TO_NETWORK[k];
  const lower = k.toLowerCase();
  if (lower.includes('mtn')) return 'MTN';
  if (lower.includes('glo')) return 'GLO';
  if (lower.includes('airtel')) return 'AIRTEL';
  if (lower.includes('etisalat') || lower.includes('9mobile')) return '9MOBILE';
  return null;
}

function parseDataPlansPayload(data) {
  const plans = [];

  const pushProduct = (network, p) => {
    if (!p || typeof p !== 'object') return;
    const planCode = p.PRODUCT_ID || p.PRODUCT_CODE || p.PRODUCT_SNO || p.plan || p.Plan;
    const planName = p.PRODUCT_NAME || p.PRODUCTNAME || p.planname || p.PlanName || planCode;
    const amount = Number(p.PRODUCT_AMOUNT || p.PRODUCTAMOUNT || p.amount || p.Amount || 0);
    if (!planCode || !amount) return;
    plans.push({
      planId: String(planCode),
      variationCode: String(p.PRODUCT_ID || p.PRODUCT_CODE || planCode),
      planName: String(planName),
      amount,
      dataType: 'gifting',
      network: normalizeNetworkKey(network),
    });
  };

  const mobileNetwork = data?.MOBILE_NETWORK || data?.mobile_network || data?.Mobile_Network;
  if (mobileNetwork && typeof mobileNetwork === 'object') {
    for (const [netKey, entries] of Object.entries(mobileNetwork)) {
      const network = normalizeNetworkKey(netKey);
      const list = Array.isArray(entries) ? entries : [entries];
      for (const entry of list) {
        const products = entry?.PRODUCT || entry?.Product || entry?.products;
        if (Array.isArray(products)) {
          for (const p of products) pushProduct(network, p);
        } else if (entry && (entry.PRODUCT_ID || entry.PRODUCT_NAME)) {
          pushProduct(network, entry);
        }
      }
    }
    if (plans.length) return plans;
  }

  const walk = (node, networkHint = null) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, networkHint);
      return;
    }
    if (typeof node !== 'object') return;

    if (node.PRODUCT_ID || node.PRODUCT_NAME) {
      pushProduct(networkHint || 'MTN', node);
      return;
    }

    if (node.plan || node.Plan || node.planid || node.dataplan || node.DataPlan) {
      pushProduct(networkHint || 'MTN', {
        PRODUCT_ID: node.plan || node.Plan || node.planid,
        PRODUCT_NAME: node.planname || node.PlanName || node.name,
        PRODUCT_AMOUNT: node.amount || node.Amount,
      });
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      const network = networkLabelFromKey(key) || networkHint;
      if (Array.isArray(value) || (value && typeof value === 'object')) {
        walk(value, network);
      }
    }
  };

  walk(data);
  return plans;
}

async function getCatalogs() {
  const now = Date.now();
  if (catalogCache.at && now - catalogCache.at < CACHE_MS) return catalogCache;

  const [dataRes, elecRes, cableRes] = await Promise.all([
    request('APIDatabundlePlansV1'),
    request('APIElectricityDiscosV1'),
    request('APICableTVPackagesV2'),
  ]);

  const dataRaw = dataRes.raw || {};
  let dataPlans = parseDataPlansPayload(dataRaw);
  if (!dataPlans.length && dataRaw && typeof dataRaw === 'object') {
    const logger = require('../core/logger');
    logger.warn('ClubKonnect data plans empty', {
      keys: Object.keys(dataRaw).slice(0, 20),
      preview: JSON.stringify(dataRaw).slice(0, 240),
    });
  }

  catalogCache = {
    at: now,
    dataPlans,
    electricity: elecRes.raw || null,
    cable: cableRes.raw || null,
  };
  return catalogCache;
}

async function fetchDataPlans(network) {
  await getCatalogs();
  const plans = catalogCache.dataPlans || [];
  if (!network) return plans;
  const net = normalizeNetworkKey(network);
  return plans.filter((p) => normalizeNetworkKey(p.network) === net);
}

async function resolveDataPlan(network, planText) {
  await getCatalogs();
  const plans = await fetchDataPlans(network);
  const needle = String(planText || '').toLowerCase().replace(/\s+/g, '');

  const byCode = plans.find((p) => String(p.variationCode).toLowerCase().replace(/\s+/g, '') === needle);
  if (byCode) {
    return {
      ok: true,
      planId: byCode.planId,
      variationCode: byCode.variationCode,
      planName: byCode.planName,
      amount: byCode.amount,
      dataType: byCode.dataType,
    };
  }

  if (/^\d+$/.test(needle)) {
    const byId = plans.find((p) => String(p.planId) === needle);
    if (byId) {
      return {
        ok: true,
        planId: byId.planId,
        variationCode: byId.variationCode,
        planName: byId.planName,
        amount: byId.amount,
        dataType: byId.dataType,
      };
    }
  }

  const byName = plans.find((p) => {
    const name = String(p.planName || '').toLowerCase().replace(/\s+/g, '');
    return name.includes(needle) || needle.includes(name);
  });
  if (byName) {
    return {
      ok: true,
      planId: byName.planId,
      variationCode: byName.variationCode,
      planName: byName.planName,
      amount: byName.amount,
      dataType: byName.dataType,
    };
  }

  const samples = plans.slice(0, 5).map((p) => p.planName).join(', ');
  return {
    ok: false,
    message:
      `Data plan "${planText || 'unknown'}" not found for ${network}.` +
      (samples ? ` Try: ${samples}` : ''),
  };
}

async function purchaseAirtime({ network, phone, amount, type, plan, resolvedPlan }) {
  if (!getApiKey() || !getUserId()) {
    return {
      ok: true,
      message: `[Demo] ${type} purchased: ${network} ${phone}. Add CLUBKONNECT_USER_ID + CLUBKONNECT_API_KEY.`,
      simulated: true,
    };
  }

  const code = networkCode(network);
  if (!code) return { ok: false, message: `Unsupported network: ${network}` };

  const normalizedPhone = normalizePhone(phone);
  const requestRef = buildRef();

  if (type === 'data') {
    const resolved = resolvedPlan?.ok ? resolvedPlan : await resolveDataPlan(network, plan);
    if (!resolved.ok) return resolved;

    return request('APIDatabundleV1', {
      MobileNetwork: code,
      DataPlan: resolved.variationCode,
      MobileNumber: normalizedPhone,
      RequestID: requestRef,
      CallBackURL: callbackUrl(),
    });
  }

  const airtimeAmount = Math.max(Number(amount) || 0, 100);
  return request('APIAirtimeV1', {
    MobileNetwork: code,
    Amount: airtimeAmount,
    MobileNumber: normalizedPhone,
    RequestID: requestRef,
    CallBackURL: callbackUrl(),
  });
}

function resolveDiscoCode(provider) {
  const key = String(provider || 'IKEDC').toUpperCase().replace(/[^A-Z]/g, '');
  return DISCO_CODES[key] || DISCO_CODES[String(provider || '').toUpperCase()] || null;
}

function resolveMeterType(type) {
  const t = String(type || 'prepaid').toLowerCase();
  return t === 'postpaid' ? '02' : '01';
}

async function getElectricityDiscos() {
  await getCatalogs();
  const defaults = [
    { id: '01', name: 'Eko Electric - EKEDC', code: 'EKEDC' },
    { id: '02', name: 'Ikeja Electric - IKEDC', code: 'IKEDC' },
    { id: '03', name: 'Abuja Electric - AEDC', code: 'AEDC' },
    { id: '04', name: 'Kano Electric - KEDCO', code: 'KEDCO' },
    { id: '05', name: 'Port Harcourt - PHED', code: 'PHED' },
    { id: '06', name: 'Jos Electric - JED', code: 'JED' },
    { id: '07', name: 'Ibadan Electric - IBEDC', code: 'IBEDC' },
    { id: '08', name: 'Kaduna Electric - KAEDC', code: 'KAEDC' },
    { id: '09', name: 'Enugu Electric - EEDC', code: 'EEDC' },
  ];

  const raw = catalogCache.electricity;
  if (!raw || typeof raw !== 'object') return defaults;

  const list = Array.isArray(raw) ? raw : raw.discos || raw.Discos || raw.products || [];
  if (!Array.isArray(list) || !list.length) return defaults;

  return list.map((item, idx) => ({
    id: String(item.code || item.Code || item.id || idx + 1).padStart(2, '0'),
    name: item.name || item.Name || item.disco || `Disco ${idx + 1}`,
    code: item.code || item.Code || item.uid || item.UID || '',
  }));
}

async function getBettingBookmakers() {
  return BETTING_COMPANIES.map((b) => ({ id: b.id, name: b.name, code: b.code }));
}

function parseCablePackages(raw, billType) {
  if (!raw || typeof raw !== 'object') return [];
  const code = CABLE_CODES[String(billType || '').toLowerCase()];
  if (!code) return [];

  let packages = [];
  if (Array.isArray(raw)) packages = raw;
  else if (Array.isArray(raw[code])) packages = raw[code];
  else if (Array.isArray(raw.packages)) packages = raw.packages;
  else {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value) && key.toLowerCase().includes(code)) {
        packages = value;
        break;
      }
    }
  }

  return packages
    .map((item) => ({
      productId: code,
      variationCode: item.package || item.Package || item.code || item.Code || item.name,
      name: item.package || item.Package || item.name || item.Name,
      amount: Number(item.amount || item.Amount || item.price || 0),
    }))
    .filter((p) => p.variationCode && p.amount > 0);
}

async function getCablePackages(billType) {
  await getCatalogs();
  return parseCablePackages(catalogCache.cable, billType);
}

async function payBill(bill) {
  if (!getApiKey() || !getUserId()) {
    return {
      ok: true,
      message: `[Demo] ${bill.type} bill paid — ${bill.amount}. Add CLUBKONNECT credentials.`,
      token: '1234-5678-9012-3456',
      simulated: true,
    };
  }

  const requestRef = buildRef();
  const billType = String(bill.type || '').toLowerCase();

  if (billType === 'electricity') {
    const disco = resolveDiscoCode(bill.provider);
    if (!disco) {
      return { ok: false, message: `Electricity provider "${bill.provider}" not supported on ClubKonnect.` };
    }

    return request('APIElectricityV1', {
      ElectricCompany: disco,
      MeterNo: String(bill.meter),
      MeterType: resolveMeterType(bill.meterType),
      Amount: Number(bill.amount),
      RequestID: requestRef,
      CallBackURL: callbackUrl(),
    });
  }

  if (['dstv', 'gotv', 'startimes'].includes(billType)) {
    const cable = CABLE_CODES[billType];
    const smartcard = bill.smartcard || bill.meter;
    const variation = bill.variationCode || bill.variation?.variationCode || bill.package;

    if (!variation) {
      return { ok: false, message: 'Cable package not selected. Pick a bouquet from the list.' };
    }

    return request('APICableTVV1', {
      CableTV: cable,
      MeterType: variation,
      SmartCardNo: String(smartcard),
      RequestID: requestRef,
      CallBackURL: callbackUrl(),
    });
  }

  if (billType === 'betting') {
    const bookmaker =
      BETTING_COMPANIES.find(
        (b) =>
          b.id === String(bill.productId || bill.bookmakerId || '').toLowerCase() ||
          b.code.toLowerCase() === String(bill.bookmakerName || '').toLowerCase()
      ) || BETTING_COMPANIES[0];

    return request('APIBettingV1', {
      BettingCompany: bookmaker.code,
      CustomerID: String(bill.customerId),
      Amount: Number(bill.amount),
      RequestID: requestRef,
      CallBackURL: callbackUrl(),
    });
  }

  return { ok: false, message: `Bill type "${bill.type}" is not supported on ClubKonnect.` };
}

async function getBalance() {
  return request('APIWalletBalanceV1');
}

async function checkServerIp() {
  return request('APIServerIPV1');
}

module.exports = {
  purchaseAirtime,
  payBill,
  getBalance,
  checkServerIp,
  fetchDataPlans,
  resolveDataPlan,
  getElectricityDiscos,
  getBettingBookmakers,
  getCablePackages,
  getCatalogs,
  buildRef,
};
