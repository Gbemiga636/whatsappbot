/**
 * Checkout method picker — Paystack or direct OPay.
 */

const crypto = require('crypto');
const whatsapp = require('../whatsapp');
const opay = require('../providers/opay');
const wallet = require('./walletService');
const guestPurchase = require('./guestPurchase');
const { getSession, setSession } = require('../sessionStore');
const { normalizePhone } = require('../utils/phone');

function formatNaira(n) {
  return wallet.formatNaira(n);
}

async function offerPaymentMethods(phone, pending) {
  const session = getSession(phone) || { data: {} };
  setSession(phone, {
    ...session,
    data: {
      ...session.data,
      pendingCheckout: pending,
    },
  });

  const buttons = [{ id: 'pay_checkout_paystack', title: 'Paystack' }];
  if (opay.isConfigured()) {
    buttons.push({ id: 'pay_checkout_opay', title: 'Pay with OPay' });
  }

  await whatsapp.sendButtons(
    phone,
    `*Pay how?*\nPick Paystack or OPay.`,
    buttons
  );

  return { ok: true, awaitingPaymentMethod: true };
}

async function startPaymentForMethod(phone, method) {
  const norm = normalizePhone(phone);
  const session = getSession(norm) || { data: {} };
  const pending = session.data?.pendingCheckout;
  if (!pending) {
    await whatsapp.sendText(norm, 'No pending payment. Start your order again from the menu.');
    return { ok: false };
  }

  const provider = method === 'opay' ? 'opay' : 'paystack';

  if (pending.kind === 'wallet_topup') {
    const result = await wallet.initiateTopUp(norm, pending.amount, {
      beneficiaryPhone: pending.beneficiaryPhone,
      topupType: pending.topupType || 'self',
      provider,
    });
    if (!result.ok) {
      await whatsapp.sendText(norm, `❌ ${result.message}`);
      return result;
    }
    const label = provider === 'opay' ? 'Pay with OPay' : 'Pay with Paystack';
    await whatsapp.sendCtaUrl(
      norm,
      `Pay *${formatNaira(result.amount)}* · ${provider === 'opay' ? 'OPay' : 'Paystack'}`,
      label,
      result.paymentUrl
    );
    setSession(norm, {
      ...session,
      data: {
        ...session.data,
        pendingCheckout: null,
        pendingTopUp: result.reference,
      },
    });
    return { ok: true, awaitingPayment: true, reference: result.reference, provider };
  }

  const payment = await guestPurchase.initiateGuestPurchase(norm, {
    service: pending.service,
    baseAmount: pending.baseAmount,
    summaryText: pending.summaryText,
    purchaseId: pending.purchaseId,
    snapshot: pending.snapshot,
    provider,
  });

  if (!payment.ok) {
    await whatsapp.sendText(norm, `❌ ${payment.message || 'Could not start payment.'}`);
    return payment;
  }

  const label = provider === 'opay' ? 'Pay with OPay' : 'Pay with Paystack';
  await whatsapp.sendCtaUrl(
    norm,
    `Pay *${formatNaira(payment.total)}* · ${provider === 'opay' ? 'OPay' : 'Paystack'}`,
    label,
    payment.paymentUrl
  );

  setSession(norm, {
    ...session,
    data: {
      ...session.data,
      pendingCheckout: null,
      pendingGuestPurchase: payment.reference,
    },
  });

  return {
    ok: true,
    awaitingPayment: true,
    reference: payment.reference,
    total: payment.total,
    provider,
  };
}

function isPaymentMethodChoice(choice) {
  return choice === 'pay_checkout_paystack' || choice === 'pay_checkout_opay';
}

module.exports = {
  offerPaymentMethods,
  startPaymentForMethod,
  isPaymentMethodChoice,
  newPurchaseId: () => `GST_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
};
