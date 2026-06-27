/**
 * PIN gate — purchases authorize via secure web portal only.
 */

const transactionPin = require('./transactionPin');
const pinPortal = require('./pinPortal');
const { isProviderSuccessMessage } = require('../utils/providerSuccess');
const crypto = require('crypto');

function isPinRequired() {
  const config = require('../config');
  return config.security?.pinRequired !== false;
}

async function guardPurchase(phone, pending) {
  const { getSession } = require('../sessionStore');
  const session = getSession(phone) || {};
  const purchaseId = pending.purchaseId || `PUR_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  pending = {
    ...pending,
    purchaseId,
    snapshot: {
      airtime: session.data?.airtime ? { ...session.data.airtime } : null,
      bill: session.data?.bill ? { ...session.data.bill } : null,
    },
  };

  if (!isPinRequired()) {
    const { executePendingPurchase } = require('../wallet/purchaseHelper');
    return executePendingPurchase(phone, pending);
  }

  await transactionPin.ensurePinLoaded(phone);

  if (!(await transactionPin.isPinSetAsync(phone))) {
    await pinPortal.promptSetPin(phone, { pendingPurchase: pending });
    return { awaitingPinSetup: true };
  }

  if (transactionPin.isLocked(phone)) {
    const whatsapp = require('../whatsapp');
    await whatsapp.sendText(
      phone,
      `🔒 PIN locked. Try again in ${transactionPin.lockoutRemainingMinutes(phone)} minute(s).`
    );
    return { locked: true };
  }

  await pinPortal.promptVerifyPin(phone, pending);
  return { awaitingPin: true };
}

async function resumePendingPurchase(phone, pending) {
  if (!pending) return;

  const { executePendingPurchase } = require('../wallet/purchaseHelper');
  const { setSession, getSession } = require('../sessionStore');
  const session = getSession(phone) || {};

  // Prevent double-charge / double-refund if PIN page is submitted twice
  setSession(phone, {
    ...session,
    data: {
      ...session.data,
      pendingPurchase: null,
    },
  });

  const purchase = await executePendingPurchase(phone, pending);
  await sendPurchaseResult(phone, pending, purchase);

  setSession(phone, {
    step: 'super_menu',
    activeService: null,
    data: {
      ...(session.data?.nlHistory ? { nlHistory: session.data.nlHistory } : {}),
    },
  });
  return purchase;
}

async function sendPurchaseResult(phone, pending, purchase) {
  const whatsapp = require('../whatsapp');
  const wallet = require('../wallet/walletService');
  const { getSession } = require('../sessionStore');
  const session = getSession(phone) || {};

  if (purchase?.awaitingPin || purchase?.awaitingPinSetup || purchase?.locked) return;
  if (purchase?.paymentMethod === 'credit') return;

  const airtime = pending.snapshot?.airtime || session.data?.airtime;
  const bill = pending.snapshot?.bill || session.data?.bill;

  async function safeSend(text) {
    try {
      await whatsapp.sendText(phone, text);
    } catch (err) {
      const logger = require('../core/logger');
      logger.error('Purchase confirmation WhatsApp failed', { phone, error: err.message });
    }
  }

  if (!purchase?.ok) {
    if (purchase?.inProgress || purchase?.pending) {
      await safeSend(`⏳ ${purchase.message || 'Payment is processing. Please wait.'}`);
      return;
    }
    if (isProviderSuccessMessage(purchase?.message) && purchase?.refunded) {
      const pricing = wallet.calculateWithCommission(pending.baseAmount);
      const debit = await wallet.debitWallet(phone, pricing.total, {
        reference: `FIX_${purchase.reference || Date.now()}`,
        service: pending.service,
        metadata: { type: 'clawback_fix', reason: 'erroneous_refund' },
      });
      if (debit.ok) {
        purchase.ok = true;
        purchase.refunded = false;
        purchase.balance = debit.balance;
        purchase.total = pricing.total;
        purchase.commission = pricing.commission;
        purchase.base = pricing.base;
      }
    }
    if (!purchase?.ok) {
      if (!purchase?.offeredCredit && !purchase?.prompted) {
        const refundNote = purchase?.refunded ? '\n\n_Your wallet was refunded._' : '';
        await safeSend(`❌ ${purchase?.message || 'Payment failed'}${refundNote}`);
      }
      return;
    }
  }

  if (pending.service === 'airtime') {
    const type = airtime?.type || 'airtime';
    const label = type === 'data' ? 'Data' : 'Airtime';
    const detail = airtime?.network && airtime?.phone
      ? `${airtime.network} → ${airtime.phone}\n`
      : pending.summaryText
        ? `${pending.summaryText}\n`
        : '';
    const providerNote = purchase.result?.pendingWebhook
      ? '\n_Delivering to the line now…_'
      : '';
    await safeSend(
      `✅ *${label} sent!*\n\n` +
        detail +
        `${purchase.result?.message ? `${purchase.result.message}\n\n` : ''}` +
        `Ref: *${purchase.reference}*\n` +
        `Paid: ${wallet.formatNaira(purchase.total || purchase.amount)}\n` +
        (purchase.balance != null ? `Balance: ${wallet.formatNaira(purchase.balance)}` : '') +
        providerNote
    );
  } else if (pending.service === 'bills') {
    const token = purchase.result?.token;
    const tokenLine = token && token !== 'successful' ? `Token: ${token}\n` : '';
    const billDetail = bill?.type === 'betting' && bill?.bookmakerName
      ? `${bill.bookmakerName} · ID ${bill.customerId}\n`
      : '';
    await safeSend(
      `✅ *Payment successful!*\n\n` +
        billDetail +
        `Ref: *${purchase.reference}*\n` +
        tokenLine +
        `${purchase.result?.message ? `${purchase.result.message}\n` : ''}` +
        `Paid: ${wallet.formatNaira(purchase.total)}\n` +
        (purchase.balance != null ? `Balance: ${wallet.formatNaira(purchase.balance)}` : '')
    );
  } else if (pending.service === 'partners') {
    const service = session.data?.partnerService;
    await safeSend(
      `✅ *${service?.name || 'Order'}* booked!\n\nRef: *${purchase.reference}*\n` +
        `Paid: ${wallet.formatNaira(purchase.total)}`
    );
  }
}

module.exports = {
  isPinRequired,
  guardPurchase,
  resumePendingPurchase,
};
