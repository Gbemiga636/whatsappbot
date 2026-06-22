const BaseService = require('../BaseService');
const telecom = require('../../providers/telecomProvider');
const { confirmAndPay, confirmAndPayWithCredit, wallet, credit } = require('../../wallet/purchaseHelper');
const { normalizeNetwork } = require('../../router/nlOrderParser');

const NETWORKS = ['MTN', 'GLO', 'Airtel', '9mobile'];

function toLocalPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('234')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0')) return digits;
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

class AirtimeService extends BaseService {
  constructor() {
    super('airtime', {
      name: 'Airtime & Data',
      emoji: '📱',
      description: 'Buy airtime & data bundles',
      steps: {
        PICK_TYPE: 'pick_type',
        PICK_NETWORK: 'pick_network',
        PICK_RECIPIENT: 'pick_recipient',
        ENTER_PHONE: 'enter_phone',
        ENTER_AMOUNT: 'enter_amount',
        CONFIRM: 'confirm',
      },
    });
  }

  async showMenu(ctx) {
    const balance = await wallet.getBalance(ctx.phone);
    await this.list(ctx.phone, `*📱 Airtime & Data*\n\nWallet: ${wallet.formatNaira(balance)}`, 'Choose', [{
      title: 'Options',
      rows: [
        { id: 'airtime_buy', title: '💳 Buy airtime', description: 'Pay from wallet' },
        { id: 'airtime_data', title: '📶 Buy data', description: 'Data bundles' },
      ],
    }]);
    await this.updateSession(ctx.phone, { step: this.STEPS.MENU });
  }

  async handle(ctx) {
    if (this.isHome(ctx.text)) return this.goHome(ctx.phone);
    if (this.isCancel(ctx.text)) { await this.reply(ctx.phone, 'Cancelled.'); return this.goHome(ctx.phone); }

    const { choice, step, data } = ctx;

    if (choice === 'airtime_buy' || choice === 'airtime_data') {
      const type = choice === 'airtime_data' ? 'data' : 'airtime';
      await this.list(ctx.phone, 'Select network:', 'Network', [{
        title: 'Networks',
        rows: NETWORKS.map((n) => ({ id: `net_${n.toLowerCase()}`, title: n, description: type === 'data' ? 'Data' : 'Airtime' })),
      }]);
      await this.updateSession(ctx.phone, { step: this.STEPS.PICK_NETWORK, data: { airtime: { type } } });
      return;
    }

    if (step === this.STEPS.PICK_NETWORK || choice?.startsWith('net_')) {
      const netFromChoice = choice?.replace('net_', '');
      const netFromText = !netFromChoice && ctx.text ? normalizeNetwork(ctx.text) : null;
      const net = netFromChoice || (netFromText ? netFromText.toLowerCase() : null);
      if (net) {
        const network = netFromChoice ? net.toUpperCase() : netFromText;
        if (!NETWORKS.includes(network)) return this.showMenu(ctx);
        const airtime = { ...data.airtime, network };
        await this.buttons(
          ctx.phone,
          `*${net.toUpperCase()} ${airtime.type}*\n\nWho are you buying for?`,
          [
            { id: 'air_self', title: 'For myself' },
            { id: 'air_other', title: 'For someone else' },
          ]
        );
        await this.updateSession(ctx.phone, {
          step: this.STEPS.PICK_RECIPIENT,
          data: { airtime },
        });
        return;
      }
    }

    if (step === this.STEPS.PICK_RECIPIENT) {
      if (choice === 'air_self') {
        const myPhone = toLocalPhone(ctx.phone);
        const airtime = { ...data.airtime, phone: myPhone, recipientType: 'self' };
        const isData = airtime.type === 'data';
        await this.reply(
          ctx.phone,
          isData
            ? `Buying for *your number* (+${wallet.normalizePhone(ctx.phone)}).\n\nEnter data plan (e.g. 1GB, 5GB):`
            : `Buying for *your number* (+${wallet.normalizePhone(ctx.phone)}).\n\nEnter amount in Naira (e.g. 500):`
        );
        await this.updateSession(ctx.phone, { step: this.STEPS.ENTER_AMOUNT, data: { airtime } });
        return;
      }
      if (choice === 'air_other') {
        await this.reply(
          ctx.phone,
          'Enter the recipient phone number:\n\n_e.g. 08012345678 or 2348012345678_'
        );
        await this.updateSession(ctx.phone, {
          step: this.STEPS.ENTER_PHONE,
          data: { airtime: { ...data.airtime, recipientType: 'other' } },
        });
        return;
      }
    }

    if (step === this.STEPS.ENTER_PHONE) {
      const phone = toLocalPhone(ctx.text);
      if (phone.length < 11) {
        await this.reply(ctx.phone, 'Enter a valid Nigerian phone number.');
        return;
      }
      const isData = data.airtime?.type === 'data';
      await this.reply(ctx.phone, isData ? 'Enter data plan (e.g. 1GB, 5GB):' : 'Enter amount in Naira (e.g. 500):');
      await this.updateSession(ctx.phone, { step: this.STEPS.ENTER_AMOUNT, data: { airtime: { ...data.airtime, phone } } });
      return;
    }

    if (step === this.STEPS.ENTER_AMOUNT) {
      const airtime = { ...data.airtime, value: ctx.text };
      let amount;
      if (airtime.type === 'data') {
        const resolved = await telecom.resolveDataPlan(airtime.network, ctx.text);
        if (!resolved.ok) {
          await this.reply(ctx.phone, resolved.message);
          return;
        }
        airtime.resolvedPlan = resolved;
        amount = resolved.amount;
      } else {
        amount = parseFloat(ctx.text.replace(/[₦,]/g, ''));
      }
      if (!amount || amount < 50) { await this.reply(ctx.phone, 'Minimum ₦50.'); return; }
      airtime.amount = amount;
      const pricing = wallet.formatWalletSummary(amount);
      const buttons = [
        { id: 'air_confirm', title: 'Pay from wallet' },
        { id: 'air_cancel', title: 'Cancel' },
      ];
      const eligibility = await credit.checkEligibility(ctx.phone, amount);
      if (eligibility.ok) {
        buttons.splice(1, 0, { id: 'air_credit', title: '⚡ Pay with credit' });
      }
      await this.buttons(
        ctx.phone,
        `*Confirm*\n\n${airtime.type === 'data' ? 'Plan' : 'Amount'}: ${airtime.resolvedPlan?.planName || ctx.text}\nNetwork: ${airtime.network}\nPhone: ${airtime.phone}\n\n${pricing.text}`,
        buttons.slice(0, 3)
      );
      await this.updateSession(ctx.phone, { step: this.STEPS.CONFIRM, data: { airtime } });
      return;
    }

    if (step === this.STEPS.CONFIRM && choice === 'air_credit') {
      const airtime = data.airtime;
      const purchase = await confirmAndPayWithCredit(ctx.phone, {
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
      if (purchase?.awaitingPin || purchase?.awaitingPinSetup || purchase?.locked) return;
      return this.showMenu(ctx);
    }

    if (step === this.STEPS.CONFIRM && choice === 'air_confirm') {
      const airtime = data.airtime;
      const baseAmount = airtime.amount || 500;

      const purchase = await confirmAndPay(ctx.phone, {
        service: 'airtime',
        baseAmount,
        summaryText: `${airtime.network} ${airtime.type}`,
        execute: () =>
          telecom.purchaseAirtime({
            network: airtime.network,
            phone: airtime.phone,
            amount: baseAmount,
            type: airtime.type,
            plan: airtime.value,
          }),
      });

      if (purchase?.awaitingPin || purchase?.awaitingPinSetup || purchase?.locked) return;

      if (purchase.ok) {
        const providerNote = purchase.result?.pendingWebhook
          ? '\n_Airtime is being delivered shortly._'
          : '';
        await this.reply(
          ctx.phone,
          `✅ *${airtime.type} purchased!*\n\n` +
            `${purchase.result?.message ? `${purchase.result.message}\n\n` : ''}` +
            `Ref: *${purchase.reference}*\n` +
            `Paid: ${wallet.formatNaira(purchase.total)} (fee: ${wallet.formatNaira(purchase.commission)})\n` +
            `Balance: ${wallet.formatNaira(purchase.balance)}` +
            providerNote
        );
      }
      await this.updateSession(ctx.phone, { step: this.STEPS.MENU, data: {} });
      return this.showMenu(ctx);
    }

    return this.showMenu(ctx);
  }
}

module.exports = AirtimeService;
