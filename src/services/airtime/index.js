const BaseService = require('../BaseService');
const telecom = require('../../providers/telecomProvider');
const { confirmAndPay, confirmAndPayWithCredit, wallet, credit } = require('../../wallet/purchaseHelper');
const {
  filterBundlesByPeriod,
  paginateItems,
  formatBundleTitle,
  formatAmountTitle,
} = require('../../utils/vtuCatalog');

const NETWORKS = ['MTN', 'GLO', 'Airtel', '9mobile'];
const AIRTIME_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

function toLocalPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('234')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0')) return digits;
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

function networkFromChoice(choice) {
  const map = { mtn: 'MTN', glo: 'GLO', airtel: 'Airtel', '9mobile': '9mobile' };
  const key = String(choice || '').replace('net_', '').toLowerCase();
  return map[key] || null;
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
        PICK_PERIOD: 'pick_period',
        PICK_BUNDLE: 'pick_bundle',
        PICK_AMOUNT: 'pick_amount',
        ENTER_AMOUNT: 'enter_amount',
        CONFIRM: 'confirm',
      },
    });
  }

  async showMenu(ctx) {
    const balance = await wallet.getBalance(ctx.phone);
    await this.list(ctx.phone, `*📱 Airtime & Data*\n\nWallet: ${wallet.formatNaira(balance)}`, 'Choose', [{
      title: 'What do you need?',
      rows: [
        { id: 'airtime_buy', title: '💳 Airtime', description: 'Top up in seconds' },
        { id: 'airtime_data', title: '📶 Data bundles', description: 'Pick from live plans' },
      ],
    }]);
    await this.updateSession(ctx.phone, { step: this.STEPS.MENU, data: {} });
  }

  async showNetworkPicker(ctx, type) {
    await this.list(
      ctx.phone,
      type === 'data' ? '*Pick network for data*' : '*Pick network for airtime*',
      'Networks',
      [{
        title: 'Network',
        rows: NETWORKS.map((n) => ({
          id: `net_${n.toLowerCase()}`,
          title: n,
          description: type === 'data' ? 'Data bundles' : 'VTU airtime',
        })),
      }]
    );
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_NETWORK,
      data: { airtime: { type } },
    });
  }

  async showRecipientPicker(ctx, airtime) {
    await this.buttons(
      ctx.phone,
      `*${airtime.network} ${airtime.type === 'data' ? 'data' : 'airtime'}*\n\nWho is this for?`,
      [
        { id: 'air_self', title: 'My number' },
        { id: 'air_other', title: 'Someone else' },
      ]
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.PICK_RECIPIENT, data: { airtime } });
  }

  async showAirtimeAmounts(ctx, airtime) {
    const rows = AIRTIME_AMOUNTS.map((amt) => ({
      id: `air_amt_${amt}`,
      title: formatAmountTitle(amt),
      description: `${airtime.network} → ${airtime.phone}`,
    }));
    rows.push({ id: 'air_amt_custom', title: 'Other amount', description: 'Type any amount' });

    await this.list(
      ctx.phone,
      `*${airtime.network} airtime*\n📞 ${airtime.phone}\n\nPick amount:`,
      'Amounts',
      [{ title: 'Quick amounts', rows: rows.slice(0, 10) }]
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.PICK_AMOUNT, data: { airtime } });
  }

  async showDataPeriodPicker(ctx, airtime) {
    await this.list(
      ctx.phone,
      `*${airtime.network} data*\n📞 ${airtime.phone}\n\nChoose bundle type:`,
      'Bundle type',
      [{
        title: 'Duration',
        rows: [
          { id: 'data_period_daily', title: '📅 Daily', description: '1-day bundles' },
          { id: 'data_period_weekly', title: '📆 Weekly', description: '7-day bundles' },
          { id: 'data_period_monthly', title: '🗓️ Monthly', description: '30-day bundles' },
          { id: 'data_period_all', title: '📋 All bundles', description: 'Everything available' },
        ],
      }]
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.PICK_PERIOD, data: { airtime } });
  }

  async showDataBundles(ctx, airtime, period, page = 0) {
    const all = await telecom.fetchDataPlans(airtime.network);
    const filtered = filterBundlesByPeriod(all, period.replace('data_period_', ''));
    const { items, hasMore, total } = paginateItems(filtered, page);

    if (!items.length) {
      await this.reply(ctx.phone, `No ${period.replace('data_period_', '')} bundles for ${airtime.network}. Try another duration.`);
      return this.showDataPeriodPicker(ctx, airtime);
    }

    const rows = items.map((b, i) => ({
      id: `data_bundle_${page * 9 + i}`,
      title: formatBundleTitle(b).slice(0, 24),
      description: `${b.dataType || 'data'} · ${airtime.network}`.slice(0, 72),
    }));
    if (hasMore) {
      rows.push({ id: `data_page_${page + 1}`, title: '➡️ More bundles', description: `Page ${page + 2}` });
    }

    await this.list(
      ctx.phone,
      `*${airtime.network} — ${period.replace('data_period_', '').toUpperCase()}*\n${total} bundle(s) · pick one:`,
      'Bundles',
      [{ title: 'Available plans', rows: rows.slice(0, 10) }]
    );

    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_BUNDLE,
      data: {
        airtime,
        dataPeriod: period,
        dataBundles: filtered,
        dataPage: page,
      },
    });
  }

  async showConfirm(ctx, airtime) {
    const pricing = wallet.formatWalletSummary(airtime.amount);
    const buttons = [
      { id: 'air_confirm', title: '✅ Pay now' },
      { id: 'air_cancel', title: 'Cancel' },
    ];
    const eligibility = await credit.checkEligibility(ctx.phone, airtime.amount);
    if (eligibility.ok) {
      buttons.splice(1, 0, { id: 'air_credit', title: '⚡ Use credit' });
    }

    const detail =
      airtime.type === 'data'
        ? `Plan: *${airtime.resolvedPlan?.planName}*\nPrice: *${wallet.formatNaira(airtime.amount)}*`
        : `Amount: *${wallet.formatNaira(airtime.amount)}*`;

    await this.buttons(
      ctx.phone,
      `*Confirm ${airtime.type}*\n\n${detail}\nNetwork: ${airtime.network}\nPhone: ${airtime.phone}\n\n${pricing.text}`,
      buttons.slice(0, 3)
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.CONFIRM, data: { airtime } });
  }

  async executePurchase(ctx, airtime, useCredit = false) {
    const opts = {
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
          resolvedPlan: airtime.resolvedPlan,
        }),
    };

    const purchase = useCredit
      ? await confirmAndPayWithCredit(ctx.phone, opts)
      : await confirmAndPay(ctx.phone, opts);

    if (purchase?.awaitingPin || purchase?.awaitingPinSetup || purchase?.locked) return;

    if (purchase?.ok) {
      const note = purchase.result?.pendingWebhook ? '\n_Delivering now…_' : '';
      await this.reply(
        ctx.phone,
        `✅ *${airtime.type} sent!*\n\n` +
          `${purchase.result?.message ? `${purchase.result.message}\n\n` : ''}` +
          `Ref: *${purchase.reference}*\n` +
          `Paid: ${wallet.formatNaira(purchase.total)}\n` +
          `Balance: ${wallet.formatNaira(purchase.balance)}` +
          note
      );
    }
    return this.showMenu(ctx);
  }

  async handle(ctx) {
    if (this.isHome(ctx.text)) return this.goHome(ctx.phone);
    if (this.isCancel(ctx.text) || ctx.choice === 'air_cancel') {
      await this.reply(ctx.phone, 'Cancelled.');
      return this.goHome(ctx.phone);
    }

    const { choice, step, data, text } = ctx;

    if (choice === 'airtime_buy') return this.showNetworkPicker(ctx, 'airtime');
    if (choice === 'airtime_data') return this.showNetworkPicker(ctx, 'data');

    if (step === this.STEPS.PICK_NETWORK || choice?.startsWith('net_')) {
      const network = networkFromChoice(choice);
      if (network) {
        return this.showRecipientPicker(ctx, { ...data.airtime, network });
      }
    }

    if (step === this.STEPS.PICK_RECIPIENT) {
      if (choice === 'air_self') {
        const airtime = {
          ...data.airtime,
          phone: toLocalPhone(ctx.phone),
          recipientType: 'self',
        };
        if (airtime.type === 'data') return this.showDataPeriodPicker(ctx, airtime);
        return this.showAirtimeAmounts(ctx, airtime);
      }
      if (choice === 'air_other') {
        await this.reply(ctx.phone, 'Send the recipient number:\n_e.g. 08012345678_');
        await this.updateSession(ctx.phone, {
          step: this.STEPS.ENTER_PHONE,
          data: { airtime: { ...data.airtime, recipientType: 'other' } },
        });
        return;
      }
    }

    if (step === this.STEPS.ENTER_PHONE) {
      const phone = toLocalPhone(text);
      if (phone.length < 11) {
        await this.reply(ctx.phone, 'Enter a valid Nigerian number.');
        return;
      }
      const airtime = { ...data.airtime, phone };
      if (airtime.type === 'data') return this.showDataPeriodPicker(ctx, airtime);
      return this.showAirtimeAmounts(ctx, airtime);
    }

    if (step === this.STEPS.PICK_PERIOD && choice?.startsWith('data_period_')) {
      return this.showDataBundles(ctx, data.airtime, choice, 0);
    }

    if (step === this.STEPS.PICK_BUNDLE) {
      if (choice?.startsWith('data_page_')) {
        const page = Number(choice.replace('data_page_', ''));
        return this.showDataBundles(ctx, data.airtime, data.dataPeriod, page);
      }

      if (choice?.startsWith('data_bundle_')) {
        const idx = Number(choice.replace('data_bundle_', ''));
        const bundle = data.dataBundles?.[idx];
        if (!bundle) {
          await this.reply(ctx.phone, 'Bundle not found. Pick again.');
          return this.showDataBundles(ctx, data.airtime, data.dataPeriod, data.dataPage || 0);
        }
        const airtime = {
          ...data.airtime,
          amount: bundle.amount,
          value: bundle.variationCode,
          resolvedPlan: {
            ok: true,
            planId: bundle.planId,
            variationCode: bundle.variationCode,
            planName: bundle.planName,
            amount: bundle.amount,
            dataType: bundle.dataType,
          },
        };
        return this.showConfirm(ctx, airtime);
      }
    }

    if (step === this.STEPS.PICK_AMOUNT) {
      let amount;
      if (choice === 'air_amt_custom') {
        await this.reply(ctx.phone, 'Enter amount in Naira (min ₦50):');
        await this.updateSession(ctx.phone, { step: this.STEPS.ENTER_AMOUNT, data });
        return;
      }
      if (choice?.startsWith('air_amt_')) {
        amount = Number(choice.replace('air_amt_', ''));
      }
      if (!amount || amount < 50) {
        await this.reply(ctx.phone, 'Minimum airtime is ₦50.');
        return;
      }
      return this.showConfirm(ctx, { ...data.airtime, amount });
    }

    if (step === this.STEPS.ENTER_AMOUNT) {
      const amount = parseFloat(text.replace(/[₦,]/g, ''));
      if (!amount || amount < 50) {
        await this.reply(ctx.phone, 'Minimum ₦50.');
        return;
      }
      return this.showConfirm(ctx, { ...data.airtime, amount });
    }

    if (step === this.STEPS.CONFIRM && choice === 'air_credit') {
      return this.executePurchase(ctx, data.airtime, true);
    }
    if (step === this.STEPS.CONFIRM && choice === 'air_confirm') {
      return this.executePurchase(ctx, data.airtime, false);
    }

    return this.showMenu(ctx);
  }
}

module.exports = AirtimeService;
