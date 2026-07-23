/**
 * Purchase helper — wallet checkout at VTU & bill payments.
 *
 * Rules:
 * - Guests: Paystack only → fulfill after payment webhook (never call VTU before pay).
 * - Logged-in: sufficient wallet balance AND PIN authorization before provider call.
 */

const whatsapp = require('../whatsapp');
const wallet = require('../wallet/walletService');
const pinGate = require('../security/pinGate');
const guestPurchase = require('./guestPurchase');
const telecom = require('../providers/telecomProvider');
const { getSession } = require('../sessionStore');
const { isGuest, isAuthenticated } = require('../userStore');
const logger = require('../core/logger');

async function sendTopUpPrompt(phone, shortfall, context = '') {
  const amount = Math.max(Math.ceil(shortfall), 100);
  const paymentChooser = require('./paymentChooser');

  await whatsapp.sendText(
    phone,
    `💳 Need *${wallet.formatNaira(amount)}* more${context ? ` for ${context}` : ''}.\nTop up to continue:`
  );

  const offered = await paymentChooser.offerPaymentMethods(phone, {
    kind: 'wallet_topup',
    amount,
    topupType: 'self',
    beneficiaryPhone: phone,
  });

  return { ...offered, prompted: true, insufficient: true, ok: false };
}

/** Pre-check balance without debiting or calling the provider. */
async function checkWalletAffordability(phone, baseAmount) {
  const pricing = wallet.calculateWithCommission(baseAmount);
  const balance = await wallet.refreshWalletFromDb(phone);
  if (balance < pricing.total) {
    return {
      ok: false,
      insufficient: true,
      balance,
      required: pricing.total,
      shortfall: pricing.total - balance,
      ...pricing,
    };
  }
  return { ok: true, balance, ...pricing };
}

async function executePendingPurchase(phone, pending, { pinVerified = false } = {}) {
  if (!pending) return { ok: false, message: 'No pending purchase' };

  if (!pinVerified && pinGate.isPinRequired()) {
    logger.warn('Blocked purchase without PIN authorization', {
      phone,
      service: pending.service,
      purchaseId: pending.purchaseId,
    });
    return { ok: false, message: 'Enter your transaction PIN to authorize this payment.' };
  }

  const session = getSession(phone) || {};
  const { service, baseAmount, summaryText } = pending;

  const afford = await checkWalletAffordability(phone, baseAmount);
  if (!afford.ok) {
    const pricing = wallet.formatWalletSummary(baseAmount);
    await whatsapp.sendText(
      phone,
      `💳 Balance *${wallet.formatNaira(afford.balance)}* · need *${wallet.formatNaira(afford.shortfall)}* more\n${summaryText || service}\n${pricing.text}`
    );
    return sendTopUpPrompt(phone, afford.shortfall, service);
  }

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
          customer: { name: 'Bygate Customer', phone },
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
  if (typeof execute !== 'function') {
    return { ok: false, message: 'Invalid purchase — missing provider step.' };
  }

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
        `💳 Need *${wallet.formatNaira(purchase.shortfall)}* more\n${summaryText}\n${pricing.text}`
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
  // Never call opts.execute here — only after payment webhook confirms
  const paymentChooser = require('./paymentChooser');
  const purchaseId = opts.purchaseId || paymentChooser.newPurchaseId();
  const session = getSession(phone) || {};
  const snapshot = guestPurchase.buildPendingSnapshot(session);
  const pricing = wallet.formatWalletSummary(opts.baseAmount);

  await whatsapp.sendText(
    phone,
    `💳 *Guest checkout*\n${opts.summaryText}\n${pricing.text}\n\nPick how to pay:`
  );

  const offered = await paymentChooser.offerPaymentMethods(phone, {
    kind: 'guest_purchase',
    service: opts.service,
    baseAmount: opts.baseAmount,
    summaryText: opts.summaryText,
    purchaseId,
    snapshot,
  });

  return {
    ok: true,
    awaitingPayment: true,
    awaitingPaymentMethod: true,
    reference: purchaseId,
    total: pricing.total,
    fulfilled: false,
    ...offered,
  };
}

function isCheckoutPending(purchase) {
  return !!(
    purchase?.awaitingPayment ||
    purchase?.awaitingPin ||
    purchase?.awaitingPinSetup ||
    purchase?.locked ||
    purchase?.fulfilled === false
  );
}

async function confirmAndPay(phone, opts) {
  if (isGuest(phone)) {
    return confirmAndPayAsGuest(phone, opts);
  }

  if (!isAuthenticated(phone)) {
    return { ok: false, message: 'Please log in or continue as guest first.' };
  }

  // Balance first — don't ask for PIN if they can't afford it
  const afford = await checkWalletAffordability(phone, opts.baseAmount);
  if (!afford.ok) {
    const pricing = wallet.formatWalletSummary(opts.baseAmount);
    await whatsapp.sendText(
      phone,
      `💳 Need *${wallet.formatNaira(afford.shortfall)}* more\n${opts.summaryText || opts.service}\n${pricing.text}`
    );
    return sendTopUpPrompt(phone, afford.shortfall, opts.service);
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
  checkWalletAffordability,
  wallet,
};
