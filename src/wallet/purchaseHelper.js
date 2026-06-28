/**
 * Purchase helper — wallet checkout at VTU & bill payments.
 */

const whatsapp = require('../whatsapp');
const wallet = require('../wallet/walletService');
const pinGate = require('../security/pinGate');
const guestPurchase = require('./guestPurchase');
const telecom = require('../providers/telecomProvider');
const { getSession } = require('../sessionStore');
const { isGuest } = require('../userStore');

async function sendTopUpPrompt(phone, shortfall, context = '') {
  const amount = Math.max(Math.ceil(shortfall), 100);
  const topUp = await wallet.initiateTopUp(phone, amount);

  if (!topUp.ok) {
    await whatsapp.sendText(phone, `⚠️ ${topUp.message}\n\nType *wallet* to top up manually.`);
    return topUp;
  }

  const msg =
    `💳 *Insufficient balance*\n\n` +
    `You need ${wallet.formatNaira(amount)} more${context ? ` for ${context}` : ''}.\n\n` +
    `Tap below to top up via Paystack (card, bank, USSD).`;

  await whatsapp.sendText(phone, msg);
  await whatsapp.sendCtaUrl(
    phone,
    `Pay ${wallet.formatNaira(topUp.amount)} — balance updates automatically after payment.`,
    'Top up now',
    topUp.paymentUrl
  );

  return { ...topUp, prompted: true };
}

async function executePendingPurchase(phone, pending) {
  if (!pending) return { ok: false, message: 'No pending purchase' };

  const session = getSession(phone) || {};
  const { service, baseAmount, summaryText } = pending;

  let execute;
  const airtime = pending.snapshot?.airtime || session.data?.airtime;
  const bill = pending.snapshot?.bill || session.data?.bill;

  if (service === 'airtime') {
    const bulk = pending.snapshot?.bulkAirtime || session.data?.bulkAirtime;
    if (bulk?.recipients?.length) {
      const totalBase = bulk.amount * bulk.recipients.length;
      execute = async () => {
        const results = [];
        for (const r of bulk.recipients) {
          const res = await telecom.purchaseAirtime({
            network: bulk.network,
            phone: r.phone,
            amount: bulk.amount,
            type: 'airtime',
          });
          results.push({ ...r, ok: res.ok, message: res.message });
        }
        const okCount = results.filter((x) => x.ok).length;
        if (!okCount) return { ok: false, message: results[0]?.message || 'All transfers failed' };
        const lines = results
          .filter((x) => x.ok)
          .slice(0, 10)
          .map((x) => `✓ ${x.name} (${x.phone})`)
          .join('\n');
        return {
          ok: true,
          message: `Sent to *${okCount}/${bulk.recipients.length}* numbers.\n${lines}`,
          results,
        };
      };
      return _confirmAndPay(phone, {
        service,
        baseAmount: totalBase,
        summaryText: `${bulk.network} airtime ×${bulk.recipients.length}`,
        execute,
        notify: false,
        purchaseId: pending.purchaseId,
      });
    }
    if (!airtime) return { ok: false, message: 'Airtime session expired. Start again.' };
    execute = () =>
      telecom.purchaseAirtime({
        network: airtime.network,
        phone: airtime.phone,
        amount: airtime.amount || baseAmount,
        type: airtime.type,
        plan: airtime.value,
        resolvedPlan: airtime.resolvedPlan,
      });
  } else if (service === 'bills') {
    if (!bill) return { ok: false, message: 'Bill session expired. Start again.' };
    execute = () => telecom.payBill({ ...bill, phone });
  } else if (service === 'partners') {
    execute = async () => ({ ok: true, message: 'Order placed' });
  } else if (service === 'food') {
    const food = pending.snapshot?.food || session.data?.food;
    if (!food?.checkout || !food?.vendor) {
      return { ok: false, message: 'Food order expired. Start again.' };
    }
    const chowdeck = require('../providers/chowdeck');
    const checkout = food.checkout;
    const orderRef = chowdeck.buildOrderReference();
    execute = async () => {
      let deliveryNote = '';
      if (checkout.feeId) {
        const delivery = await chowdeck.createRelayDelivery({
          feeId: checkout.feeId,
          source: checkout.source,
          destination: checkout.destination,
          customer: { name: 'Mysogi Customer', phone },
          orderReference: orderRef,
          notes: `Food order ${orderRef}`,
        });
        deliveryNote = delivery.ok
          ? `\nDelivery ref: *${delivery.reference}*`
          : `\n_${delivery.message || 'Delivery dispatch pending'}_`;
      }
      return {
        ok: true,
        message: `Order placed with *${food.vendor.name}*.${deliveryNote}`,
        orderReference: orderRef,
      };
    };
  } else {
    return { ok: false, message: 'Unknown purchase type' };
  }

  return _confirmAndPay(phone, {
    service,
    baseAmount,
    summaryText,
    execute,
    notify: false,
    purchaseId: pending.purchaseId,
  });
}

async function _confirmAndPay(phone, { service, baseAmount, summaryText, execute, notify = true, purchaseId }) {
  const purchase = await wallet.purchaseWithWallet(phone, {
    service,
    baseAmount,
    metadata: { provider: service, purchaseId },
    execute,
  });

  if (purchase.insufficient) {
    if (notify) {
      const pricing = wallet.formatWalletSummary(baseAmount);
      await whatsapp.sendText(
        phone,
        `💳 *Not enough balance*\n\n` +
          `${summaryText}\n\n` +
          `${pricing.text}\n\n` +
          `Your balance: *${wallet.formatNaira(purchase.balance)}*\n` +
          `You need: *${wallet.formatNaira(purchase.shortfall)}* more\n\n` +
          `_The total includes a small Mysogi service fee._`
      );
      return sendTopUpPrompt(phone, purchase.shortfall, service);
    }
    return purchase;
  }

  if (!purchase.ok) {
    if (notify) {
      if (purchase.inProgress || purchase.pending) {
        await whatsapp.sendText(phone, `⏳ ${purchase.message || 'Payment is processing.'}`);
        return purchase;
      }
      const refundNote = purchase.refunded ? '\n\n_Your wallet was refunded automatically._' : '';
      await whatsapp.sendText(phone, `❌ ${purchase.message || 'Payment failed'}${refundNote}`);
      return purchase;
    }
    return purchase;
  }

  return purchase;
}

async function confirmAndPayAsGuest(phone, opts) {
  const session = getSession(phone) || {};
  const purchaseId = opts.purchaseId || `GST_${Date.now()}_${require('crypto').randomBytes(4).toString('hex')}`;
  const snapshot = guestPurchase.buildPendingSnapshot(session);
  const pricing = wallet.formatWalletSummary(opts.baseAmount);

  await whatsapp.sendText(
    phone,
    `💳 *Guest checkout*\n\n` +
      `${opts.summaryText}\n\n` +
      `${pricing.text}\n\n` +
      `Tap below to pay securely with Paystack (card, bank, USSD).\n` +
      `_Your order is sent only after payment succeeds._`
  );

  const payment = await guestPurchase.initiateGuestPurchase(phone, {
    ...opts,
    purchaseId,
    snapshot,
  });

  if (!payment.ok) {
    await whatsapp.sendText(phone, `❌ ${payment.message || 'Could not start payment.'}`);
    return payment;
  }

  await whatsapp.sendCtaUrl(
    phone,
    `Pay *${wallet.formatNaira(payment.total)}* — your order is fulfilled automatically after payment.`,
    'Pay with Paystack',
    payment.paymentUrl
  );

  return { ok: true, awaitingPayment: true, reference: payment.reference, total: payment.total };
}

function isCheckoutPending(purchase) {
  return !!(
    purchase?.awaitingPayment ||
    purchase?.awaitingPin ||
    purchase?.awaitingPinSetup ||
    purchase?.locked
  );
}

async function confirmAndPay(phone, opts) {
  if (isGuest(phone)) {
    return confirmAndPayAsGuest(phone, opts);
  }
  if (pinGate.isPinRequired() && !opts.skipPin) {
    return pinGate.guardPurchase(phone, {
      method: 'wallet',
      service: opts.service,
      baseAmount: opts.baseAmount,
      summaryText: opts.summaryText,
    });
  }
  return _confirmAndPay(phone, opts);
}

module.exports = {
  sendTopUpPrompt,
  confirmAndPay,
  confirmAndPayAsGuest,
  executePendingPurchase,
  isCheckoutPending,
  wallet,
};
