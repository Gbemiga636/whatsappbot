/**
 * Purchase helper — wallet checkout at VTU & bill payments.
 */

const whatsapp = require('../whatsapp');
const wallet = require('../wallet/walletService');
const pinGate = require('../security/pinGate');
const telecom = require('../providers/telecomProvider');
const { getSession } = require('../sessionStore');

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

async function confirmAndPay(phone, opts) {
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
  executePendingPurchase,
  wallet,
};
