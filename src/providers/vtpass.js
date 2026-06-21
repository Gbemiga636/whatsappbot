/**
 * VTPass — airtime, data, electricity, cable TV bills.
 * https://www.vtpass.com/documentation
 */

const axios = require('axios');
const config = require('../config');

const BASE = config.bills.vtpass.sandbox
  ? 'https://sandbox.vtpass.com/api'
  : 'https://vtpass.com/api';

function getCredentials() {
  const { apiKey, publicKey, secretKey } = config.bills.vtpass;
  if (!apiKey || !secretKey) return null;
  return { apiKey, publicKey, secretKey };
}

/** VTPass requires request_id: YYYYMMDDHHmm + suffix (Lagos time) */
function buildRequestId() {
  const lagos = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const prefix =
    `${lagos.getUTCFullYear()}${pad(lagos.getUTCMonth() + 1)}${pad(lagos.getUTCDate())}` +
    `${pad(lagos.getUTCHours())}${pad(lagos.getUTCMinutes())}`;
  return `${prefix}mysogi${Date.now().toString(36)}`;
}

function getHeaders(method) {
  const creds = getCredentials();
  if (!creds) return null;

  if (method === 'GET') {
    return {
      'api-key': creds.apiKey,
      'public-key': creds.publicKey,
      'Content-Type': 'application/json',
    };
  }

  return {
    'api-key': creds.apiKey,
    'secret-key': creds.secretKey,
    'Content-Type': 'application/json',
  };
}

const NETWORK_IDS = { MTN: 'mtn', GLO: 'glo', AIRTEL: 'airtel', '9MOBILE': 'etisalat' };

function parseResponse(data) {
  const ok =
    data.code === '000' ||
    data.response_description?.toUpperCase().includes('SUCCESS') ||
    data.content?.transactions?.status === 'delivered';

  let message = data.response_description || data.message || JSON.stringify(data);

  if (!ok && /IP NOT WHITELISTED/i.test(String(data?.content?.errors || message))) {
    message =
      'VTPass blocked this server IP. Whitelist your IP in your VTPass live profile, or contact VTPass support.';
  }

  if (!ok && config.bills.vtpass.sandbox && data.code === '016') {
    message =
      'VTPass sandbox cannot recharge real phone numbers. ' +
      'Use test number *08011111111* in sandbox, or switch to live VTPass keys for real numbers.';
  }

  return {
    ok,
    message,
    transactionId: data.content?.transactions?.transactionId || data.requestId,
    token: data.purchased_code || data.token || data.content?.transactions?.product_name,
    raw: data,
  };
}

async function purchaseAirtime({ network, phone, amount, type, plan }) {
  const h = getHeaders('POST');
  if (!h) {
    return {
      ok: true,
      message: `[Demo] ${type} purchased: ${network} ${phone}. Add VTPASS_API_KEY + VTPASS_SECRET_KEY.`,
      simulated: true,
    };
  }

  const net = NETWORK_IDS[network.toUpperCase()] || 'mtn';
  const serviceId = type === 'data' ? `${net}-data` : net;
  const normalizedPhone = phone.replace(/\D/g, '').replace(/^234/, '0');

  try {
    const body = {
      request_id: buildRequestId(),
      serviceID: serviceId,
      phone: normalizedPhone,
    };

    if (type === 'data') {
      body.billersCode = normalizedPhone;
      if (plan) body.variation_code = plan;
    } else {
      body.amount = Number(amount) || 100;
    }

    const { data } = await axios.post(`${BASE}/pay`, body, { headers: h, timeout: 30000 });
    return parseResponse(data);
  } catch (err) {
    const detail = err.response?.data;
    return {
      ok: false,
      message: detail?.response_description || detail?.message || err.message,
      raw: detail,
    };
  }
}

async function payBill(bill) {
  const h = getHeaders('POST');
  if (!h) {
    return {
      ok: true,
      message: `[Demo] ${bill.type} bill paid — ${bill.amount}. Add VTPASS_API_KEY + VTPASS_SECRET_KEY.`,
      token: '1234-5678-9012-3456',
      simulated: true,
    };
  }

  const serviceMap = {
    electricity: (bill.provider || 'ikeja-electric').toLowerCase().replace(/\s+/g, '-'),
    dstv: 'dstv',
    gotv: 'gotv',
    startimes: 'startimes',
  };

  try {
    const body = {
      request_id: buildRequestId(),
      serviceID: serviceMap[bill.type] || bill.type,
      billersCode: bill.meter || bill.smartcard,
      amount: Number(bill.amount),
      phone: (bill.phone || '08011111111').replace(/\D/g, '').replace(/^234/, '0'),
    };

    const { data } = await axios.post(`${BASE}/pay`, body, { headers: h, timeout: 30000 });
    return parseResponse(data);
  } catch (err) {
    const detail = err.response?.data;
    return {
      ok: false,
      message: detail?.response_description || detail?.message || err.message,
      raw: detail,
    };
  }
}

function parseBalanceResponse(data) {
  const balance =
    data?.contents?.balance ??
    data?.content?.balance ??
    data?.content?.wallet_balance ??
    data?.wallet_balance;

  const code = String(data?.code ?? '');
  const errorText =
    data?.content?.errors ||
    data?.contents?.errors ||
    data?.response_description ||
    data?.message;

  const ok =
    balance != null &&
    (code === '1' || code === '000' || code === '0' || data?.response_description === 'SUCCESS');

  if (ok) {
    return { ok: true, balance: Number(balance), raw: data };
  }

  if (code === '027' || /IP NOT WHITELISTED/i.test(String(errorText))) {
    return {
      ok: false,
      message:
        'VTPass blocked this server IP. Whitelist your IP in your VTPass live profile, or contact VTPass support.',
      raw: data,
    };
  }

  if (code === '023' || /API ACCESS NOT ENABLE/i.test(String(errorText))) {
    return {
      ok: false,
      message: 'API access is not enabled on your VTPass account. Contact VTPass support to activate it.',
      raw: data,
    };
  }

  return {
    ok: false,
    message: errorText || `VTPass balance check failed (code ${code || 'unknown'})`,
    raw: data,
  };
}

/** Wallet balance (sandbox/live) */
async function getBalance() {
  const h = getHeaders('GET');
  if (!h) return { ok: false, message: 'VTPass not configured' };

  try {
    const { data } = await axios.get(`${BASE}/balance`, { headers: h, timeout: 15000 });
    return parseBalanceResponse(data);
  } catch (err) {
    const detail = err.response?.data;
    const code = detail?.code || detail?.response_code;
    const msg =
      detail?.response_description ||
      detail?.message ||
      (code === '023'
        ? 'API access not enabled on your VTPass account. Enable it in your live profile or contact VTPass support.'
        : null) ||
      err.message;
    return {
      ok: false,
      message: msg,
      httpStatus: err.response?.status,
      raw: detail,
    };
  }
}

module.exports = { purchaseAirtime, payBill, getBalance, buildRequestId };
