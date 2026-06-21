/**
 * Global credit actions — activation, repayment, pending BNPL checkout.
 */

const whatsapp = require('../whatsapp');
const { getSession, setSession } = require('../sessionStore');
const credit = require('./creditService');
const creditScoring = require('./creditScoring');
const { confirmAndPayWithCredit } = require('../wallet/purchaseHelper');
const wallet = require('../wallet/walletService');
const telecom = require('../providers/telecomProvider');
const { getService } = require('../router/serviceRegistry');
const logger = require('../core/logger');

const CREDIT_CHOICES = new Set([
  'credit_activate',
  'credit_repay',
  'credit_use_now',
  'credit_pay_airtime',
  'credit_pay_bills',
  'credit_pay_partners',
]);

function isCreditChoice(choice) {
  if (!choice) return false;
  return CREDIT_CHOICES.has(choice) || choice.startsWith('credit_pay_');
}

async function handleCreditAction(phone, choice, session) {
  if (choice === 'credit_activate') {
    const result = await credit.activateCreditLine(phone);
    await whatsapp.sendText(phone, result.message);
    if (result.ok) {
      const loans = getService('loans');
      if (loans) await loans.showMenu({ phone, step: 'menu', data: {} });
    }
    return true;
  }

  if (choice === 'credit_repay') {
    const result = await credit.manualRepay(phone);
    if (result.ok) {
      await whatsapp.sendText(
        phone,
        `✅ *Credit repaid!*\n\nPaid: ${wallet.formatNaira(result.repaid)}\n` +
          `Remaining: ${wallet.formatNaira(result.remaining)}\n` +
          `Wallet: ${wallet.formatNaira(result.balance)}`
      );
    } else {
      await whatsapp.sendText(phone, `⚠️ ${result.message}`);
      if (result.insufficient) {
        await whatsapp.sendButtons(phone, 'Top up to repay?', [
          { id: 'wallet_topup_self', title: 'Top up wallet' },
          { id: 'svc_loans', title: 'Credit hub' },
        ]);
      }
    }
    return true;
  }

  if (choice === 'credit_use_now' || isCreditChoice(choice)) {
    const service = choice.replace('credit_pay_', '').replace('credit_use_now', '') || session.data?.pendingCreditPurchase?.service;
    const pending = session.data?.pendingCreditPurchase;
    const data = session.data || {};

    if (service === 'airtime' || choice === 'credit_pay_airtime') {
      const airtime = data.airtime;
      if (!airtime?.amount) {
        await whatsapp.sendText(phone, 'No pending airtime purchase. Start again from *Airtime* menu.');
        return true;
      }
      await confirmAndPayWithCredit(phone, {
        service: 'airtime',
        baseAmount: airtime.amount,
        summaryText: `${airtime.network} ${airtime.type} → ${airtime.phone}`,
        execute: () =>
          telecom.purchaseAirtime({
            network: airtime.network,
            phone: airtime.phone,
            amount: airtime.amount,
            type: airtime.type,
            plan: airtime.value,
          }),
      });
      const airSvc = getService('airtime');
      if (airSvc) await airSvc.showMenu({ phone, step: 'menu', data: {} });
      return true;
    }

    if (service === 'bills' || choice === 'credit_pay_bills') {
      const bill = data.bill;
      if (!bill?.amount) {
        await whatsapp.sendText(phone, 'No pending bill payment. Start again from *Bills* menu.');
        return true;
      }
      await confirmAndPayWithCredit(phone, {
        service: 'bills',
        baseAmount: bill.amount,
        summaryText: `${bill.type} bill`,
        execute: () => telecom.payBill({ ...bill, phone }),
      });
      const billSvc = getService('bills');
      if (billSvc) await billSvc.showMenu({ phone, step: 'menu', data: {} });
      return true;
    }

    if (pending?.service) {
      logger.warn('Unresolved credit purchase', { phone, pending });
      await whatsapp.sendText(phone, 'Complete your purchase from the service menu, then choose *Pay with credit*.');
      return true;
    }
  }

  return false;
}

async function handleCreditCommand(phone, text) {
  const t = (text || '').trim().toLowerCase();
  if (!['credit', 'loan', 'loans', 'borrow', 'bnpl', 'pay later'].some((k) => t === k || t.includes(k))) {
    return false;
  }

  setSession(phone, { step: 'loans_menu', activeService: 'loans', data: {} });
  const loans = getService('loans');
  await loans.showMenu({ phone, step: 'menu', data: {} });
  return true;
}

async function sendPredictiveOffer(phone, { service, amount, message }) {
  const profile = await creditScoring.getProfile(phone);
  if (!profile.activated || profile.available < amount) return false;

  const balance = await wallet.getBalance(phone);
  const { total } = wallet.formatWalletSummary(amount);
  if (balance >= total) return false;

  await whatsapp.sendButtons(
    phone,
    credit.formatCreditOffer(profile, amount, message),
    [
      { id: `credit_pay_${service}`, title: '⚡ Use credit' },
      { id: 'wallet_topup_self', title: 'Top up wallet' },
    ]
  );
  return true;
}

module.exports = { handleCreditAction, handleCreditCommand, isCreditChoice, sendPredictiveOffer };
