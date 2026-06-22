/**
 * Purchase helper — wallet + instant credit (BNPL) at checkout.
 */

const whatsapp = require('../whatsapp');
const wallet = require('../wallet/walletService');
const credit = require('../credit/creditService');
const creditScoring = require('../credit/creditScoring');
const config = require('../config');
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

async function offerCreditOrTopUp(phone, { shortfall, baseAmount, summaryText, service, execute }) {
  const eligibility = await credit.checkEligibility(phone, baseAmount);

  if (eligibility.ok) {
    await whatsapp.sendText(
      phone,
      `*${summaryText}*\n\n` +
        `Your wallet is short by ${wallet.formatNaira(shortfall)}.\n\n` +
        credit.formatCreditOffer(eligibility.profile, baseAmount, 'You qualify for instant credit in chat.')
    );
    await whatsapp.sendButtons(phone, 'How would you like to pay?', [
      { id: `credit_pay_${service}`, title: '⚡ Use credit' },
      { id: 'wallet_topup_self', title: '💳 Top up wallet' },
    ]);

    const { setSession, getSession } = require('../sessionStore');
    const session = getSession(phone) || {};
    setSession(phone, {
      ...session,
      data: {
        ...session.data,
        pendingCreditPurchase: { service, baseAmount, summaryText },
      },
    });

    return { offeredCredit: true, eligibility };
  }

  if (eligibility.needsActivation && config.credit.enabled) {
    await whatsapp.sendText(
      phone,
      `*${summaryText}*\n\nShort by ${wallet.formatNaira(shortfall)}.\n\n` +
        `💡 *Unlock instant credit* — type *credit* to activate your Mysogi credit line.\n` +
        `Or top up your wallet below.`
    );
    await whatsapp.sendButtons(phone, 'Choose an option', [
      { id: 'credit_activate', title: '⚡ Activate credit' },
      { id: 'wallet_topup_self', title: '💳 Top up wallet' },
    ]);
    return { offeredActivation: true };
  }

  await whatsapp.sendText(
    phone,
    `*${summaryText}*\n\nYour balance: ${wallet.formatNaira(await wallet.getBalance(phone))}\nShort by: ${wallet.formatNaira(shortfall)}`
  );
  return sendTopUpPrompt(phone, shortfall, service);
}

async function executePendingPurchase(phone, pending) {
  if (!pending) return { ok: false, message: 'No pending purchase' };

  const session = getSession(phone) || {};
  const { method, service, baseAmount, summaryText } = pending;

  let execute;
  if (service === 'airtime') {
    const airtime = session.data?.airtime;
    if (!airtime) return { ok: false, message: 'Airtime session expired. Start again.' };
    execute = () =>
      telecom.purchaseAirtime({
        network: airtime.network,
        phone: airtime.phone,
        amount: airtime.amount || baseAmount,
        type: airtime.type,
        plan: airtime.value,
      });
  } else if (service === 'bills') {
    const bill = session.data?.bill;
    if (!bill) return { ok: false, message: 'Bill session expired. Start again.' };
    execute = () => telecom.payBill({ ...bill, phone });
  } else if (service === 'partners') {
    execute = async () => ({ ok: true, message: 'Order placed' });
  } else {
    return { ok: false, message: 'Unknown purchase type' };
  }

  if (method === 'credit') {
    return _confirmAndPayWithCredit(phone, {
      service,
      baseAmount,
      summaryText,
      execute,
      notify: false,
      purchaseId: pending.purchaseId,
    });
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
  const pricing = wallet.formatWalletSummary(baseAmount);

  const purchase = await wallet.purchaseWithWallet(phone, {
    service,
    baseAmount,
    metadata: { provider: service, purchaseId },
    execute,
  });

  if (purchase.insufficient) {
    if (config.credit.enabled) {
      return offerCreditOrTopUp(phone, {
        shortfall: purchase.shortfall,
        baseAmount,
        summaryText,
        service,
        execute,
      });
    }
    if (notify) {
      await whatsapp.sendText(
        phone,
        `*${summaryText}*\n\n${pricing.text}\n\nYour balance: ${wallet.formatNaira(purchase.balance)}\nShort by: ${wallet.formatNaira(purchase.shortfall)}`
      );
    }
    return sendTopUpPrompt(phone, purchase.shortfall, service);
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

async function _confirmAndPayWithCredit(phone, { service, baseAmount, summaryText, execute }) {
  const purchase = await credit.purchaseWithCredit(phone, {
    service,
    baseAmount,
    metadata: { summaryText },
    execute,
  });

  if (!purchase.ok) {
    if (purchase.insufficient || purchase.needsActivation) {
      await whatsapp.sendText(phone, `⚠️ ${purchase.message}`);
      if (purchase.needsActivation) {
        await whatsapp.sendButtons(phone, 'Activate Mysogi Credit?', [
          { id: 'credit_activate', title: 'Activate now' },
          { id: 'wallet_topup_self', title: 'Top up instead' },
        ]);
      }
      return purchase;
    }
    await whatsapp.sendText(phone, `❌ ${purchase.message || 'Credit purchase failed'}`);
    return purchase;
  }

  const dueDate = new Date(purchase.dueAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
  await whatsapp.sendText(
    phone,
    `✅ *Paid with Mysogi Credit*\n\n` +
      `${summaryText}\n` +
      `Total due: ${wallet.formatNaira(purchase.total)} by *${dueDate}*\n` +
      `Ref: *${purchase.reference}*\n\n` +
      `_Auto-repays when you top up your wallet._`
  );

  return purchase;
}

async function confirmAndPayWithCredit(phone, opts) {
  if (pinGate.isPinRequired() && !opts.skipPin) {
    return pinGate.guardPurchase(phone, {
      method: 'credit',
      service: opts.service,
      baseAmount: opts.baseAmount,
      summaryText: opts.summaryText,
    });
  }
  return _confirmAndPayWithCredit(phone, opts);
}

async function maybeOfferProactiveCredit(phone, baseAmount, context) {
  if (!config.credit.enabled) return false;

  const profile = await creditScoring.getProfile(phone);
  if (!profile.activated || profile.available < baseAmount) return false;

  const balance = await wallet.getBalance(phone);
  const { total } = wallet.formatWalletSummary(baseAmount);
  if (balance >= total) return false;

  await whatsapp.sendButtons(
    phone,
    credit.formatCreditOffer(profile, baseAmount, context || 'Your wallet is low — continue with instant credit?'),
    [
      { id: 'credit_use_now', title: '⚡ Use credit' },
      { id: 'wallet_topup_self', title: 'Top up wallet' },
    ]
  );
  return true;
}

module.exports = {
  sendTopUpPrompt,
  offerCreditOrTopUp,
  confirmAndPay,
  confirmAndPayWithCredit,
  executePendingPurchase,
  maybeOfferProactiveCredit,
  wallet,
  credit,
};
