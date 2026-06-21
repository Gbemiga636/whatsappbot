/**
 * Paystack — payments, transfers, payment links.
 * https://paystack.com/docs/api/
 */

const axios = require('axios');
const config = require('../config');

const BASE = 'https://api.paystack.co';

function isConfigured() {
  return !!config.payments.paystack.secretKey;
}

function headers() {
  const key = config.payments.paystack.secretKey;
  if (!key) return null;
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/** Create a payment link user can open to pay (card, bank, USSD) */
async function initializePayment({ email, amount, reference, metadata, callbackUrl }) {
  const h = headers();
  if (!h) {
    return {
      ok: false,
      message: 'Add PAYSTACK_SECRET_KEY to .env (sk_test_... from Paystack dashboard)',
    };
  }

  try {
    const { data } = await axios.post(
      `${BASE}/transaction/initialize`,
      {
        email,
        amount: Math.round(amount * 100),
        reference,
        metadata: { ...metadata, source: 'mysogi_whatsapp' },
        callback_url: callbackUrl,
        channels: ['card', 'bank', 'ussd', 'bank_transfer', 'qr'],
      },
      { headers: h }
    );
    return {
      ok: data.status,
      authorizationUrl: data.data?.authorization_url,
      accessCode: data.data?.access_code,
      reference: data.data?.reference,
    };
  } catch (err) {
    return { ok: false, message: err.response?.data?.message || err.message };
  }
}

/** Verify a completed payment */
async function verifyPayment(reference) {
  const h = headers();
  if (!h) return { ok: false, message: 'Paystack not configured' };

  try {
    const { data } = await axios.get(`${BASE}/transaction/verify/${reference}`, { headers: h });
    return {
      ok: data.status && data.data?.status === 'success',
      amount: (data.data?.amount || 0) / 100,
      reference: data.data?.reference,
      paidAt: data.data?.paid_at,
    };
  } catch (err) {
    return { ok: false, message: err.response?.data?.message || err.message };
  }
}

module.exports = { isConfigured, initializePayment, verifyPayment };
