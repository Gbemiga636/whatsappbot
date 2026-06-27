const BaseService = require('../BaseService');
const telecom = require('../../providers/telecomProvider');
const { confirmAndPay, confirmAndPayWithCredit, wallet, credit } = require('../../wallet/purchaseHelper');
const {
  filterBundlesByPeriod,
  paginateItems,
  formatBundleTitle,
  formatBundleListRow,
  formatAmountTitle,
  PAGE_SIZE,
} = require('../../utils/vtuCatalog');

const NETWORKS = ['MTN', 'GLO', 'Airtel', '9mobile'];
const AIRTIME_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];
const MIN_AIRTIME_AMOUNT = 100;

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

function periodLabel(period) {
  const key = String(period || '').replace('data_period_', '');
  if (!key || key === 'all') return 'ALL';
  return key.toUpperCase();
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
    const periodNote =
      airtime.type === 'data' && airtime.dataPeriod
        ? `\nDuration: *${periodLabel(airtime.dataPeriod)}*`
        : '';
    await this.buttons(
      ctx.phone,
      `*${airtime.network} ${airtime.type === 'data' ? 'data' : 'airtime'}*${periodNote}\n\nWho is this for?`,
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
      `*${airtime.network} data*\n\nChoose bundle duration:`,
      'Duration',
      [{
        title: 'How long?',
        rows: [
          { id: 'data_period_all', title: '📋 All bundles', description: 'Show every plan available' },
          { id: 'data_period_daily', title: '📅 Daily', description: '1–3 day plans' },
          { id: 'data_period_weekly', title: '📆 Weekly', description: '7-day plans' },
          { id: 'data_period_monthly', title: '🗓️ Monthly', description: '30-day & longer plans' },
        ],
      }]
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.PICK_PERIOD, data: { airtime } });
  }

  async showDataBundles(ctx, airtime, period, page = 0) {
    await this.reply(ctx.phone, `⏳ Loading *${airtime.network}* data bundles…`);

    let all;
    try {
      all = await telecom.fetchDataPlans(airtime.network);
    } catch (err) {
      await this.reply(ctx.phone, 'Could not load bundles. Try again in a moment.');
      return this.showDataPeriodPicker(ctx, airtime);
    }

    if (!all?.length) {
      await this.reply(ctx.phone, `No data plans available for *${airtime.network}* right now. Try another network.`);
      return this.showNetworkPicker(ctx, 'data');
    }

    const periodKey = String(period || 'data_period_all').replace('data_period_', '');
    const filtered = filterBundlesByPeriod(all, periodKey);

    if (!filtered.length) {
      await this.reply(
        ctx.phone,
        `No *${periodLabel(period)}* bundles for *${airtime.network}* right now.\n\nTry *All bundles* or another duration.`
      );
      if (airtime.phone) {
        return this.showDataBundles(ctx, airtime, 'data_period_all', 0);
      }
      return this.showDataPeriodPicker(ctx, airtime);
    }

    const { items, hasMore, total } = paginateItems(filtered, page);

    const rows = items.map((b, i) => {
      const row = formatBundleListRow({ ...b, network: airtime.network });
      return {
        id: `data_bundle_p${page}_i${i}`,
        title: row.title,
        description: row.description,
      };
    });

    if (page > 0) {
      rows.unshift({ id: `data_page_${page - 1}`, title: '⬅️ Previous', description: 'Earlier bundles' });
    }
    if (hasMore) {
      rows.push({ id: `data_page_${page + 1}`, title: '➡️ More bundles', description: `Page ${page + 2}` });
    }
    rows.push({ id: 'data_filter', title: '🔍 Change filter', description: 'Daily / weekly / monthly' });

    await this.list(
      ctx.phone,
      `*${airtime.network} data* — ${periodLabel(period)}\n📞 ${airtime.phone}\n${total} plan(s)\n\nTap a bundle below:`,
      'Bundles',
      [{ title: 'Available plans', rows: rows.slice(0, 10) }]
    );

    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_BUNDLE,
      data: {
        airtime,
        dataPeriod: period || 'data_period_all',
        dataBundles: filtered,
        dataPage: page,
      },
    });
  }

  resolveBundleFromChoice(choice, data) {
    const m = String(choice || '').match(/^data_bundle_p(\d+)_i(\d+)$/);
    if (!m) return null;
    const page = Number(m[1]);
    const i = Number(m[2]);
    const idx = page * PAGE_SIZE + i;
    return data.dataBundles?.[idx] || null;
  }

  async showConfirm(ctx, airtime) {
    const afford = await wallet.canAffordPurchase(ctx.phone, airtime.amount);
    if (!afford.ok) {
      await this.reply(
        ctx.phone,
        `💳 *Insufficient balance*\n\n` +
          `Plan price: ${wallet.formatNaira(afford.base)}\n` +
          `Mysogi fee: ${wallet.formatNaira(afford.commission)}\n` +
          `*Total needed: ${wallet.formatNaira(afford.total)}*\n\n` +
          `Your balance: *${wallet.formatNaira(afford.balance)}*\n` +
          `Short by: *${wallet.formatNaira(afford.shortfall)}*\n\n` +
          `Top up your wallet first, then try again.`
      );
      const { sendTopUpPrompt } = require('../../wallet/purchaseHelper');
      await sendTopUpPrompt(ctx.phone, afford.shortfall, 'this purchase');
      return;
    }

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
      const note = purchase.result?.pendingWebhook ? '\n_Delivering to the line now…_' : '';
      await this.reply(
        ctx.phone,
        `✅ *${airtime.type === 'data' ? 'Data' : 'Airtime'} sent!*\n\n` +
          `${airtime.network} → ${airtime.phone}\n\n` +
          `${purchase.result?.message ? `${purchase.result.message}\n\n` : ''}` +
          `Ref: *${purchase.reference}*\n` +
          `Paid: ${wallet.formatNaira(purchase.total)}\n` +
          `Balance: ${wallet.formatNaira(purchase.balance)}` +
          note
      );
    } else if (!purchase?.offeredCredit && !purchase?.prompted && !purchase?.insufficient) {
      const refundNote = purchase?.refunded ? '\n\n_Your wallet was refunded._' : '';
      const reason =
        purchase?.message ||
        (purchase == null
          ? 'Payment session lost. Tap *Confirm* again.'
          : 'Payment could not be completed. Check your wallet balance and try again.');
      await this.reply(ctx.phone, `❌ ${reason}${refundNote}`);
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
    const airtime = data?.airtime;

    // ── Choice-first routing (works even if session step drifted) ──
    if (choice === 'airtime_buy') return this.showNetworkPicker(ctx, 'airtime');
    if (choice === 'airtime_data') return this.showNetworkPicker(ctx, 'data');

    if (choice?.startsWith('net_')) {
      const network = networkFromChoice(choice);
      if (!network) return this.showMenu(ctx);
      const base = { ...(data?.airtime || airtime || {}), network };
      const type = base.type === 'data' ? 'data' : 'airtime';
      if (type === 'data') {
        return this.showDataPeriodPicker(ctx, { ...base, type: 'data', network });
      }
      return this.showRecipientPicker(ctx, { ...base, type: 'airtime', network });
    }

    if (choice === 'air_self' && airtime) {
      const next = { ...airtime, phone: toLocalPhone(ctx.phone), recipientType: 'self' };
      if (next.type === 'data') {
        return this.showDataBundles(ctx, next, next.dataPeriod || data.dataPeriod || 'data_period_all', 0);
      }
      return this.showAirtimeAmounts(ctx, next);
    }

    if (choice === 'air_other' && airtime) {
      await this.reply(ctx.phone, 'Send the recipient number:\n_e.g. 08012345678_');
      await this.updateSession(ctx.phone, {
        step: this.STEPS.ENTER_PHONE,
        data: { airtime: { ...airtime, recipientType: 'other' } },
      });
      return;
    }

    if (choice === 'data_filter' && airtime?.type === 'data') {
      return this.showDataPeriodPicker(ctx, airtime);
    }

    if (choice?.startsWith('data_period_') && airtime?.type === 'data') {
      const withPeriod = { ...airtime, dataPeriod: choice };
      if (!withPeriod.phone) {
        return this.showRecipientPicker(ctx, withPeriod);
      }
      return this.showDataBundles(ctx, withPeriod, choice, 0);
    }

    if (choice?.startsWith('data_page_') && airtime?.type === 'data') {
      const page = Number(choice.replace('data_page_', ''));
      return this.showDataBundles(ctx, airtime, data.dataPeriod || 'data_period_all', page);
    }

    if (choice?.startsWith('data_bundle_') && airtime?.type === 'data') {
      const bundle = this.resolveBundleFromChoice(choice, data);
      if (!bundle) {
        await this.reply(ctx.phone, 'Bundle not found. Pick again from the list.');
        return this.showDataBundles(ctx, airtime, data.dataPeriod || 'data_period_all', data.dataPage || 0);
      }
      const next = {
        ...airtime,
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
      return this.showConfirm(ctx, next);
    }

    if (choice === 'air_confirm' && airtime) {
      return this.executePurchase(ctx, airtime, false);
    }
    if (choice === 'air_credit' && airtime) {
      return this.executePurchase(ctx, airtime, true);
    }

    if (choice === 'air_amt_custom' && airtime?.type === 'airtime') {
      await this.reply(ctx.phone, `Enter amount in Naira (min ${wallet.formatNaira(MIN_AIRTIME_AMOUNT)}):`);
      await this.updateSession(ctx.phone, { step: this.STEPS.ENTER_AMOUNT, data });
      return;
    }

    if (choice?.startsWith('air_amt_') && airtime?.type === 'airtime') {
      const amount = Number(choice.replace('air_amt_', ''));
      if (!amount || amount < MIN_AIRTIME_AMOUNT) {
        await this.reply(ctx.phone, `Minimum airtime is ${wallet.formatNaira(MIN_AIRTIME_AMOUNT)}.`);
        return;
      }
      return this.showConfirm(ctx, { ...airtime, amount });
    }

    // ── Text input steps ──
    if (step === this.STEPS.ENTER_PHONE && airtime) {
      const phone = toLocalPhone(text);
      if (phone.length < 11) {
        await this.reply(ctx.phone, 'Enter a valid Nigerian number (11 digits).');
        return;
      }
      const next = { ...airtime, phone };
      if (next.type === 'data') {
        return this.showDataBundles(ctx, next, next.dataPeriod || data.dataPeriod || 'data_period_all', 0);
      }
      return this.showAirtimeAmounts(ctx, next);
    }

    if (step === this.STEPS.PICK_PERIOD && airtime?.type === 'data') {
      await this.reply(ctx.phone, '_Tap Daily, Weekly, Monthly, or All bundles from the list above._');
      return;
    }

    if (step === this.STEPS.PICK_BUNDLE && airtime?.type === 'data') {
      await this.reply(ctx.phone, '_Tap a bundle from the list above, or *Change filter* to pick another duration._');
      return;
    }

    if (step === this.STEPS.PICK_AMOUNT && airtime?.type === 'airtime') {
      const parsed = parseFloat(String(text || '').replace(/[₦,]/g, ''));
      if (parsed >= MIN_AIRTIME_AMOUNT) {
        return this.showConfirm(ctx, { ...airtime, amount: parsed });
      }
      await this.reply(
        ctx.phone,
        `Pick an amount from the list above, or type a number (min ${wallet.formatNaira(MIN_AIRTIME_AMOUNT)}).`
      );
      return;
    }

    if (step === this.STEPS.ENTER_AMOUNT && airtime?.type === 'airtime') {
      const amount = parseFloat(String(text || '').replace(/[₦,]/g, ''));
      if (!amount || amount < MIN_AIRTIME_AMOUNT) {
        await this.reply(ctx.phone, `Minimum ${wallet.formatNaira(MIN_AIRTIME_AMOUNT)}.`);
        return;
      }
      return this.showConfirm(ctx, { ...airtime, amount });
    }

    if (step === this.STEPS.CONFIRM && (isAffirmation(text) || text?.toLowerCase() === 'pay')) {
      return this.executePurchase(ctx, airtime, false);
    }

    if (airtime && step && step !== this.STEPS.MENU) {
      if (airtime.type === 'data' && [this.STEPS.PICK_NETWORK, this.STEPS.PICK_RECIPIENT].includes(step)) {
        await this.reply(ctx.phone, '_Tap an option from the list above._');
        return;
      }
      await this.reply(ctx.phone, '_Tap a button or list option above, or type *menu* to go home._');
      return;
    }

    return this.showMenu(ctx);
  }
}

function isAffirmation(text) {
  return /^(yes|yeah|yep|confirm|pay|proceed|ok|go ahead|sure|do it)$/i.test(String(text || '').trim());
}

module.exports = AirtimeService;
