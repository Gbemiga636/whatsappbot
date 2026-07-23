/**
 * OPay Cashier — direct Express Checkout (Nigeria).
 * https://documentation.opaycheckout.com/
 */

const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../core/logger');

function isConfigured() {
  const o = config.payments?.opay || {};
  return !!(o.merchantId && o.publicKey && o.secretKey);
}

function baseUrl() {
  const sandbox = config.payments?.opay?.sandbox !== false;
  return sandbox
    ? 'https://testapi.opaycheckout.com/api/v1/international'
    : 'https://liveapi.opaycheckout.com/api/v1/international';
}

function signPayload(payload) {
  const secret = config.payments.opay.secretKey;
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

/**
 * @param {{ amount: number, reference: string, email?: string, phone?: string, name?: string, productName?: string, productDescription?: string, returnUrl?: string, callbackUrl?: string, cancelUrl?: string }} opts
 * amount in Naira
 */
async function initializePayment(opts) {
  if (!isConfigured()) {
    return {
      ok: false,
      message:
        'OPay is not configured yet. Add OPAY_MERCHANT_ID, OPAY_PUBLIC_KEY and OPAY_SECRET_KEY to .env — or pay with Paystack.',
    };
  }

  const amountKobo = Math.round(Number(opts.amount) * 100);
  if (!amountKobo || amountKobo < 100) {
    return { ok: false, message: 'Invalid OPay amount.' };
  }

  const returnUrl =
    opts.returnUrl ||
    (config.publicBaseUrl ? `${config.publicBaseUrl}/webhook/opay/callback` : 'https://bygate.app');
  const callbackUrl =
    opts.callbackUrl ||
    (config.publicBaseUrl ? `${config.publicBaseUrl}/webhook/opay` : undefined);

  const payload = {
    country: 'NG',
    reference: opts.reference,
    amount: { total: amountKobo, currency: 'NGN' },
    returnUrl,
    cancelUrl: opts.cancelUrl || returnUrl,
    expireAt: 60,
    customerVisitSource: 'BROWSER',
    evokeOpay: true,
    userInfo: {
      userId: opts.phone || opts.reference,
      userName: opts.name || 'Bygate Customer',
      userMobile: opts.phone ? `+${String(opts.phone).replace(/^\+/, '')}` : undefined,
      userEmail: opts.email || `user_${opts.reference}@bygate.app`,
    },
    product: {
      name: (opts.productName || 'Bygate payment').slice(0, 64),
      description: (opts.productDescription || opts.productName || 'Bygate checkout').slice(0, 120),
    },
  };
  if (callbackUrl) payload.callbackUrl = callbackUrl;

  try {
    const { data } = await axios.post(`${baseUrl()}/cashier/create`, payload, {
      headers: {
        Authorization: `Bearer ${config.payments.opay.publicKey}`,
        MerchantId: config.payments.opay.merchantId,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const ok = data?.code === '00000' || data?.data?.cashierUrl;
    const cashierUrl = data?.data?.cashierUrl || data?.data?.cashier_url;
    if (!ok || !cashierUrl) {
      return {
        ok: false,
        message: data?.message || data?.data?.message || 'OPay checkout failed to start',
      };
    }

    return {
      ok: true,
      authorizationUrl: cashierUrl,
      reference: opts.reference,
      orderNo: data?.data?.orderNo || data?.data?.order_no,
      raw: data?.data,
    };
  } catch (err) {
    logger.warn('OPay initialize failed', {
      message: err.response?.data?.message || err.message,
    });
    return {
      ok: false,
      message: err.response?.data?.message || err.message || 'OPay unavailable',
    };
  }
}

/** Query payment status by merchant reference */
async function verifyPayment(reference) {
  if (!isConfigured()) return { ok: false, message: 'OPay not configured' };

  const payload = { reference };
  try {
    const { data } = await axios.post(`${baseUrl()}/cashier/status`, payload, {
      headers: {
        Authorization: `Bearer ${signPayload(payload)}`,
        MerchantId: config.payments.opay.merchantId,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const status = String(data?.data?.status || data?.data?.orderStatus || '').toUpperCase();
    const success =
      status === 'SUCCESS' ||
      status === 'SUCCESSFUL' ||
      status === 'COMPLETED';

    const amountRaw = data?.data?.amount?.total ?? data?.data?.amount;
    const amount =
      typeof amountRaw === 'number'
        ? amountRaw / 100
        : Number(amountRaw || 0) / 100;

    return {
      ok: success,
      amount,
      reference: data?.data?.reference || reference,
      status,
      raw: data?.data,
    };
  } catch (err) {
    return { ok: false, message: err.response?.data?.message || err.message };
  }
}

module.exports = { isConfigured, initializePayment, verifyPayment, signPayload };
