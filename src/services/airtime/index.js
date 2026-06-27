const BaseService = require('../BaseService');
const telecom = require('../../providers/telecomProvider');
const { confirmAndPay, wallet } = require('../../wallet/purchaseHelper');
const {
  filterBundlesByPeriod,
  paginateItems,
  formatBundleListRow,
  formatAmountTitle,
  PAGE_SIZE,
} = require('../../utils/vtuCatalog');

const NETWORKS = ['MTN', 'GLO', 'Airtel', '9mobile'];
const AIRTIME_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];
const MIN_AIRTIME_AMOUNT = 100;
const DATA_PERIODS = ['daily', 'weekly', 'monthly'];

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

function isDataFlow(airtime) {
  return airtime?.type === 'data';
}

function isAirtimeFlow(airtime) {
  return airtime?.type === 'airtime';
}

function normalizeDataPeriod(period) {
  const key = String(period || '').replace('data_period_', '').toLowerCase();
  return DATA_PERIODS.includes(key) ? key : null;
}

function periodLabel(period) {
  const key = normalizeDataPeriod(period);
  if (key === 'daily') return 'Daily';
  if (key === 'weekly') return 'Weekly';
  if (key === 'monthly') return 'Monthly';
  return '';
}

class AirtimeService extends BaseService {
  constructor() {
    super('airtime', {
      name: 'Airtime',
      emoji: '📱',
      description: 'Buy airtime top-up',
      steps: {
        PICK_TYPE: 'airtime_pick_type',
        PICK_NETWORK: 'airtime_pick_network',
        PICK_RECIPIENT: 'airtime_pick_recipient',
        ENTER_PHONE: 'airtime_enter_phone',
        PICK_PERIOD: 'airtime_pick_period',
        PICK_BUNDLE: 'airtime_pick_bundle',
        PICK_AMOUNT: 'airtime_pick_amount',
        ENTER_AMOUNT: 'airtime_enter_amount',
        CONFIRM: 'airtime_confirm',
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
    await this.updateSession(ctx.phone, { step: this.STEPS.MENU, data: { airtime: null } });
  }

  async startDataFlow(ctx) {
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_NETWORK,
      data: { airtime: { type: 'data' }, dataPeriod: null, dataBundles: null, dataPage: 0 },
    });
    return this.showNetworkPicker(ctx, 'data');
  }

  async startAirtimeFlow(ctx) {
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_NETWORK,
      data: { airtime: { type: 'airtime' }, dataPeriod: null, dataBundles: null, dataPage: 0 },
    });
    return this.showNetworkPicker(ctx, 'airtime');
  }

  async showNetworkPicker(ctx, type) {
    const flowType = type === 'data' ? 'data' : 'airtime';
    await this.list(
      ctx.phone,
      flowType === 'data' ? '*Pick network for data*' : '*Pick network for airtime*',
      'Networks',
      [{
        title: 'Network',
        rows: NETWORKS.map((n) => ({
          id: `net_${n.toLowerCase()}`,
          title: n,
          description: flowType === 'data' ? 'Data bundles' : 'VTU airtime',
        })),
      }]
    );
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_NETWORK,
      data: { airtime: { type: flowType }, dataPeriod: null, dataBundles: null, dataPage: 0 },
    });
  }

  async showRecipientPicker(ctx, airtime) {
    const periodNote =
      isDataFlow(airtime) && airtime.dataPeriod
        ? `\nDuration: *${periodLabel(airtime.dataPeriod)}*`
        : '';
    await this.buttons(
      ctx.phone,
      `*${airtime.network} ${isDataFlow(airtime) ? 'data' : 'airtime'}*${periodNote}\n\nWho is this for?`,
      [
        { id: 'air_self', title: 'My number' },
        { id: 'air_other', title: 'Someone else' },
      ]
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.PICK_RECIPIENT, data: { airtime } });
  }

  async showAirtimeAmounts(ctx, airtime) {
    if (!isAirtimeFlow(airtime)) return this.startAirtimeFlow(ctx);

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
    if (!airtime?.network) return this.showNetworkPicker(ctx, 'data');

    await this.list(
      ctx.phone,
      `*${airtime.network} data*\n\nChoose bundle duration *before* we load plans:`,
      'Duration',
      [{
        title: 'How long?',
        rows: [
          { id: 'data_period_daily', title: '📅 Daily', description: '1–3 day plans' },
          { id: 'data_period_weekly', title: '📆 Weekly', description: '7-day plans' },
          { id: 'data_period_monthly', title: '🗓️ Monthly', description: '30-day & longer plans' },
        ],
      }]
    );
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_PERIOD,
      data: { airtime: { ...airtime, type: 'data' } },
    });
  }

  async showDataBundles(ctx, airtime, period, page = 0) {
    if (!isDataFlow(airtime)) return this.startDataFlow(ctx);

    const periodKey = normalizeDataPeriod(period || airtime.dataPeriod);
    if (!periodKey) return this.showDataPeriodPicker(ctx, { ...airtime, type: 'data' });

    const periodId = `data_period_${periodKey}`;
    const next = { ...airtime, type: 'data', dataPeriod: periodId };

    if (!next.phone) return this.showRecipientPicker(ctx, next);

    // Lock step before async fetch so stray text cannot fall into airtime amount handler
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_BUNDLE,
      data: { airtime: next, dataPeriod: periodId, dataPage: page },
    });

    await this.reply(
      ctx.phone,
      `⏳ Loading *${next.network}* *${periodLabel(periodId)}* bundles…`
    );

    let all;
    try {
      all = await telecom.fetchDataPlans(next.network);
    } catch (err) {
      await this.reply(ctx.phone, 'Could not load bundles. Try again in a moment.');
      return this.showDataPeriodPicker(ctx, next);
    }

    if (!all?.length) {
      await this.reply(ctx.phone, `No data plans available for *${next.network}* right now. Try another network.`);
      return this.showNetworkPicker(ctx, 'data');
    }

    const filtered = filterBundlesByPeriod(all, periodKey);

    if (!filtered.length) {
      await this.reply(
        ctx.phone,
        `No *${periodLabel(periodId)}* bundles for *${next.network}* right now.\n\nTry another duration.`
      );
      return this.showDataPeriodPicker(ctx, next);
    }

    const { items, hasMore, total } = paginateItems(filtered, page);

    const rows = items.map((b, i) => {
      const row = formatBundleListRow({ ...b, network: next.network });
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
    rows.push({ id: 'data_filter', title: '🔍 Change duration', description: 'Daily / weekly / monthly' });

    await this.list(
      ctx.phone,
      `*${next.network} data* — ${periodLabel(periodId)}\n📞 ${next.phone}\n${total} plan(s)\n\nTap a bundle below:`,
      'Bundles',
      [{ title: 'Available plans', rows: rows.slice(0, 10) }]
    );

    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_BUNDLE,
      data: {
        airtime: next,
        dataPeriod: periodId,
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

    const detail =
      isDataFlow(airtime)
        ? `Plan: *${airtime.resolvedPlan?.planName}*\nPrice: *${wallet.formatNaira(airtime.amount)}*`
        : `Amount: *${wallet.formatNaira(airtime.amount)}*`;

    await this.buttons(
      ctx.phone,
      `*Confirm ${airtime.type}*\n\n${detail}\nNetwork: ${airtime.network}\nPhone: ${airtime.phone}\n\n${pricing.text}`,
      buttons.slice(0, 3)
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.CONFIRM, data: { airtime } });
  }

  async executePurchase(ctx, airtime) {
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

    const purchase = await confirmAndPay(ctx.phone, opts);

    if (purchase?.awaitingPin || purchase?.awaitingPinSetup || purchase?.locked) return;

    if (purchase?.ok) {
      const note = purchase.result?.pendingWebhook ? '\n_Delivering to the line now…_' : '';
      await this.reply(
        ctx.phone,
        `✅ *${isDataFlow(airtime) ? 'Data' : 'Airtime'} sent!*\n\n` +
          `${airtime.network} → ${airtime.phone}\n\n` +
          `${purchase.result?.message ? `${purchase.result.message}\n\n` : ''}` +
          `Ref: *${purchase.reference}*\n` +
          `Paid: ${wallet.formatNaira(purchase.total)}\n` +
          `Balance: ${wallet.formatNaira(purchase.balance)}` +
          note
      );
    } else if (!purchase?.prompted && !purchase?.insufficient) {
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

    // ── Entry points ──
    if (choice === 'airtime_buy') return this.startAirtimeFlow(ctx);
    if (choice === 'airtime_data') return this.startDataFlow(ctx);

    // ── Network (must match current flow type) ──
    if (choice?.startsWith('net_')) {
      const network = networkFromChoice(choice);
      if (!network) return this.showMenu(ctx);

      if (isDataFlow(airtime) || (step === this.STEPS.PICK_NETWORK && data?.airtime?.type === 'data')) {
        return this.showDataPeriodPicker(ctx, { type: 'data', network });
      }
      if (isAirtimeFlow(airtime) || data?.airtime?.type === 'airtime') {
        return this.showRecipientPicker(ctx, { type: 'airtime', network });
      }
      return this.showMenu(ctx);
    }

    // ── Data: duration before bundles ──
    if (choice === 'data_filter' && isDataFlow(airtime)) {
      return this.showDataPeriodPicker(ctx, airtime);
    }

    if (choice?.startsWith('data_period_')) {
      const periodKey = normalizeDataPeriod(choice);
      if (!periodKey || !isDataFlow(airtime)) {
        if (isDataFlow(airtime) || airtime?.network) {
          return this.showDataPeriodPicker(ctx, airtime || { type: 'data' });
        }
        return this.showMenu(ctx);
      }
      const withPeriod = { ...airtime, type: 'data', dataPeriod: choice };
      if (!withPeriod.phone) return this.showRecipientPicker(ctx, withPeriod);
      return this.showDataBundles(ctx, withPeriod, choice, 0);
    }

    // ── Recipient ──
    if (choice === 'air_self' && airtime) {
      if (isDataFlow(airtime)) {
        const next = { ...airtime, type: 'data', phone: toLocalPhone(ctx.phone), recipientType: 'self' };
        if (!normalizeDataPeriod(next.dataPeriod)) return this.showDataPeriodPicker(ctx, next);
        return this.showDataBundles(ctx, next, next.dataPeriod, 0);
      }
      if (isAirtimeFlow(airtime)) {
        const next = { ...airtime, type: 'airtime', phone: toLocalPhone(ctx.phone), recipientType: 'self' };
        return this.showAirtimeAmounts(ctx, next);
      }
      return this.showMenu(ctx);
    }

    if (choice === 'air_other' && airtime) {
      await this.reply(ctx.phone, 'Send the recipient number:\n_e.g. 08012345678_');
      await this.updateSession(ctx.phone, {
        step: this.STEPS.ENTER_PHONE,
        data: { airtime: { ...airtime, recipientType: 'other' } },
      });
      return;
    }

    // ── Data bundle pagination & selection ──
    if (choice?.startsWith('data_page_') && isDataFlow(airtime)) {
      const page = Number(choice.replace('data_page_', ''));
      const period = data.dataPeriod || airtime.dataPeriod;
      return this.showDataBundles(ctx, airtime, period, page);
    }

    if (choice?.startsWith('data_bundle_') && isDataFlow(airtime)) {
      const bundle = this.resolveBundleFromChoice(choice, data);
      if (!bundle) {
        await this.reply(ctx.phone, 'Bundle not found. Pick again from the list.');
        const period = data.dataPeriod || airtime.dataPeriod;
        return this.showDataBundles(ctx, airtime, period, data.dataPage || 0);
      }
      const next = {
        ...airtime,
        type: 'data',
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

    // ── Airtime amounts & confirm ──
    if (choice === 'air_confirm' && airtime) {
      return this.executePurchase(ctx, airtime);
    }

    if (choice === 'air_amt_custom' && isAirtimeFlow(airtime)) {
      await this.reply(ctx.phone, `Enter amount in Naira (min ${wallet.formatNaira(MIN_AIRTIME_AMOUNT)}):`);
      await this.updateSession(ctx.phone, { step: this.STEPS.ENTER_AMOUNT, data });
      return;
    }

    if (choice?.startsWith('air_amt_') && isAirtimeFlow(airtime)) {
      const amount = Number(choice.replace('air_amt_', ''));
      if (!amount || amount < MIN_AIRTIME_AMOUNT) {
        await this.reply(ctx.phone, `Minimum airtime is ${wallet.formatNaira(MIN_AIRTIME_AMOUNT)}.`);
        return;
      }
      return this.showConfirm(ctx, { ...airtime, amount });
    }

    // ── Text input steps (data first — avoids airtime bleed-through) ──
    if (step === this.STEPS.ENTER_PHONE && airtime) {
      const phone = toLocalPhone(text);
      if (phone.length < 11) {
        await this.reply(ctx.phone, 'Enter a valid Nigerian number (11 digits).');
        return;
      }
      const next = { ...airtime, phone };
      if (isDataFlow(next)) {
        if (!normalizeDataPeriod(next.dataPeriod || data.dataPeriod)) {
          return this.showDataPeriodPicker(ctx, { ...next, type: 'data' });
        }
        const period = next.dataPeriod || data.dataPeriod;
        return this.showDataBundles(ctx, { ...next, type: 'data' }, period, 0);
      }
      if (isAirtimeFlow(next)) {
        return this.showAirtimeAmounts(ctx, { ...next, type: 'airtime' });
      }
      return this.showMenu(ctx);
    }

    if (step === this.STEPS.PICK_PERIOD && isDataFlow(airtime)) {
      await this.reply(ctx.phone, '_Tap *Daily*, *Weekly*, or *Monthly* from the list above._');
      return;
    }

    if (step === this.STEPS.PICK_BUNDLE && isDataFlow(airtime)) {
      await this.reply(ctx.phone, '_Tap a bundle from the list above, or *Change duration* to pick another period._');
      return;
    }

    if (step === this.STEPS.PICK_AMOUNT && isAirtimeFlow(airtime)) {
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

    if (step === this.STEPS.ENTER_AMOUNT && isAirtimeFlow(airtime)) {
      const amount = parseFloat(String(text || '').replace(/[₦,]/g, ''));
      if (!amount || amount < MIN_AIRTIME_AMOUNT) {
        await this.reply(ctx.phone, `Minimum ${wallet.formatNaira(MIN_AIRTIME_AMOUNT)}.`);
        return;
      }
      return this.showConfirm(ctx, { ...airtime, amount });
    }

    if (step === this.STEPS.CONFIRM && airtime && (isAffirmation(text) || text?.toLowerCase() === 'pay')) {
      return this.executePurchase(ctx, airtime);
    }

    if (airtime && step && step !== this.STEPS.MENU) {
      if (isDataFlow(airtime) && [this.STEPS.PICK_NETWORK, this.STEPS.PICK_RECIPIENT, this.STEPS.PICK_PERIOD].includes(step)) {
        await this.reply(ctx.phone, '_Tap an option from the list above._');
        return;
      }
      if (isAirtimeFlow(airtime) && [this.STEPS.PICK_NETWORK, this.STEPS.PICK_RECIPIENT].includes(step)) {
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
