const BaseService = require('../BaseService');
const telecom = require('../../providers/telecomProvider');
const { confirmAndPay, isCheckoutPending, wallet } = require('../../wallet/purchaseHelper');
const contactStore = require('../../contacts/contactStore');
const { detectNetwork, detectNetworkOrNull } = require('../../utils/networkDetect');
const {
  filterBundlesByPeriod,
  paginateItems,
  formatBundleListRow,
  formatCatalogPagePreamble,
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
        BULK_RECIPIENTS: 'airtime_bulk_recipients',
        BULK_CONFIRM: 'airtime_bulk_confirm',
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
        { id: 'airtime_bulk', title: '👥 Multiple people', description: 'Same airtime for many numbers' },
        { id: 'airtime_contacts', title: '📇 My contacts', description: 'Saved names & numbers' },
      ],
    }]);
    await this.updateSession(ctx.phone, { step: this.STEPS.MENU, data: { airtime: null } });
  }

  async startDataFlow(ctx) {
    const airtime = { type: 'data' };
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_RECIPIENT,
      data: { airtime, dataPeriod: null, dataBundles: null, dataPage: 0 },
    });
    return this.showRecipientPicker(ctx, airtime);
  }

  async startAirtimeFlow(ctx) {
    const airtime = { type: 'airtime' };
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_RECIPIENT,
      data: { airtime, dataPeriod: null, dataBundles: null, dataPage: 0 },
    });
    return this.showRecipientPicker(ctx, airtime);
  }

  /**
   * Attach auto-detected network from phone. Falls back to network picker if unknown.
   */
  async continueWithPhone(ctx, airtime, phone) {
    const local = toLocalPhone(phone);
    const detected = detectNetwork(local);
    const next = {
      ...airtime,
      phone: local,
      network: detected.network || airtime.network || null,
      networkAuto: !!detected.ok,
    };

    if (!next.network) {
      await this.reply(
        ctx.phone,
        `📞 ${local}\n\nCouldn't auto-detect the network. Please pick one:`
      );
      await this.updateSession(ctx.phone, { data: { airtime: next } });
      return this.showNetworkPicker(ctx, next.type === 'data' ? 'data' : 'airtime');
    }

    if (isDataFlow(next)) {
      if (!normalizeDataPeriod(next.dataPeriod)) {
        await this.reply(ctx.phone, `📡 ${detected.note} for ${local}`);
        return this.showDataPeriodPicker(ctx, next);
      }
      return this.showDataBundles(ctx, next, next.dataPeriod, 0);
    }

    await this.reply(ctx.phone, `📡 ${detected.note} for ${local}`);
    return this.showAirtimeAmounts(ctx, next);
  }

  async showNetworkPicker(ctx, type) {
    const { getSession } = require('../../sessionStore');
    const current = getSession(ctx.phone) || ctx.session || { data: {} };
    const prevAirtime = current.data?.airtime || {};
    const flowType = type === 'data' ? 'data' : 'airtime';
    const contactNote =
      prevAirtime.contactName && prevAirtime.phone
        ? `\n\n*${prevAirtime.contactName}* — ${prevAirtime.phone}`
        : prevAirtime.phone
          ? `\n\n${prevAirtime.phone}`
          : '';
    await this.list(
      ctx.phone,
      (flowType === 'data' ? '*Pick network for data*' : '*Pick network for airtime*') + contactNote,
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
      data: {
        airtime: { ...prevAirtime, type: flowType },
        dataPeriod: null,
        dataBundles: null,
        dataPage: 0,
      },
    });
  }

  async startTelecomForContact(ctx, { type, name, phone }) {
    const localPhone = toLocalPhone(phone);
    const flowType = type === 'data' ? 'data' : 'airtime';
    const airtime = {
      type: flowType,
      phone: localPhone,
      recipientType: 'other',
      contactName: name || null,
    };
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_RECIPIENT,
      data: {
        airtime,
        dataPeriod: null,
        dataBundles: null,
        dataPage: 0,
      },
    });
    return this.continueWithPhone(ctx, airtime, localPhone);
  }

  async showRecipientPicker(ctx, airtime) {
    const label = isDataFlow(airtime) ? 'data' : 'airtime';
    const net = airtime.network ? `*${airtime.network}* ` : '';
    await this.buttons(
      ctx.phone,
      `${net}${label}\n\nWho is this for?\n_Network is detected automatically from the number._`,
      [
        { id: 'air_self', title: 'My number' },
        { id: 'air_other', title: 'Someone else' },
      ]
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.PICK_RECIPIENT, data: { airtime } });
  }

  async showAirtimeAmounts(ctx, airtime) {
    if (!isAirtimeFlow(airtime)) return this.startAirtimeFlow(ctx);
    if (!airtime.network && airtime.phone) {
      return this.continueWithPhone(ctx, airtime, airtime.phone);
    }
    if (!airtime.network) return this.showNetworkPicker(ctx, 'airtime');

    const rows = AIRTIME_AMOUNTS.map((amt) => ({
      id: `air_amt_${amt}`,
      title: formatAmountTitle(amt),
      description: `${airtime.network} → ${airtime.phone}`,
    }));
    rows.push({ id: 'air_amt_custom', title: 'Other amount', description: 'Type any amount' });
    rows.push({
      id: 'air_change_network',
      title: 'Change network',
      description: airtime.networkAuto ? 'Wrong network? (ported number)' : 'Pick another network',
    });

    const autoNote = airtime.networkAuto ? ' _(auto-detected)_' : '';
    await this.list(
      ctx.phone,
      `*${airtime.network} airtime*${autoNote}\n📞 ${airtime.phone}\n\nPick amount:`,
      'Amounts',
      [{ title: 'Quick amounts', rows: rows.slice(0, 10) }]
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.PICK_AMOUNT, data: { airtime } });
  }

  async showDataPeriodPicker(ctx, airtime) {
    if (!airtime?.network && airtime?.phone) {
      return this.continueWithPhone(ctx, { ...airtime, type: 'data' }, airtime.phone);
    }
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

    const preamble = formatCatalogPagePreamble(items, {
      getLabel: (b) => b.planName,
      getAmount: (b) => b.amount,
    });

    await this.list(
      ctx.phone,
      `*${next.network} data* — ${periodLabel(periodId)}\n📞 ${next.phone}\n${total} plan(s) — page ${page + 1}\n\n` +
        `*Bundles on this page:*\n${preamble}\n\n` +
        `_Tap below. Price on the left; full plan name on the right._`,
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
          `Bygate fee: ${wallet.formatNaira(afford.commission)}\n` +
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
      `*Confirm ${airtime.type}*\n${detail}\n${airtime.network} → ${airtime.phone}\n${pricing.text}`,
      buttons.slice(0, 3)
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.CONFIRM, data: { airtime } });
  }

  async startBulkFlow(ctx, seed = {}) {
    const recipients = seed.recipients || [];
    await this.reply(
      ctx.phone,
      `*Bulk airtime*\n\nSend numbers, saved names, or share contacts.\nThen tap *Continue*.`
    );
    await this.updateSession(ctx.phone, {
      step: this.STEPS.BULK_RECIPIENTS,
      data: {
        bulkAirtime: {
          type: 'airtime',
          recipients,
          network: seed.network || null,
          amount: seed.amount || null,
        },
      },
    });
    if (recipients.length) await this.showBulkRecipientSummary(ctx, recipients);
  }

  dedupeRecipients(list) {
    const seen = new Set();
    return list.filter((r) => {
      const p = toLocalPhone(r.phone);
      if (!p || p.length < 11 || seen.has(p)) return false;
      seen.add(p);
      return true;
    });
  }

  async resolveRecipientsFromInput(ownerPhone, text) {
    const { phones, names } = contactStore.parseRecipientsFromText(text);
    const fromNumbers = phones.map((phone) => ({ name: phone, phone }));
    const { resolved, ambiguous, missing } = await contactStore.resolveContactNames(ownerPhone, names);
    return {
      recipients: [...fromNumbers, ...resolved],
      ambiguous,
      missing,
    };
  }

  async addBulkRecipients(ctx, incoming) {
    const bulk = ctx.data?.bulkAirtime || { type: 'airtime', recipients: [] };
    let added = [];

    if (incoming.contacts) {
      const shared = contactStore.parseSharedContacts({ contacts: incoming.contacts });
      for (const c of shared) {
        await contactStore.saveContact(ctx.phone, c);
        added.push(c);
      }
    }

    if (incoming.text?.trim()) {
      const result = await this.resolveRecipientsFromInput(ctx.phone, incoming.text);
      if (result.ambiguous?.length) {
        const lines = result.ambiguous
          .map((a) => `*${a.query}*: ${a.matches.map((m) => m.name).join(', ')}`)
          .join('\n');
        await this.reply(
          ctx.phone,
          `Which contact did you mean?\n\n${lines}\n\nReply with the full name or number.`
        );
        return;
      }
      if (result.missing?.length) {
        await this.reply(
          ctx.phone,
          `I don't have *${result.missing.join(', ')}* saved yet.\n\n` +
            `Share their WhatsApp contact card, or save them:\n` +
            `_*save contact Name 08012345678*_`
        );
      }
      added = [...added, ...result.recipients];
    }

    if (!added.length) {
      await this.reply(ctx.phone, 'No valid numbers found. Send numbers, names, or share a contact card.');
      return;
    }

    const recipients = this.dedupeRecipients([...(bulk.recipients || []), ...added]);
    await this.updateSession(ctx.phone, {
      step: this.STEPS.BULK_RECIPIENTS,
      data: { bulkAirtime: { ...bulk, recipients } },
    });
    await this.reply(ctx.phone, `✅ Added ${added.length} recipient(s).`);
    return this.showBulkRecipientSummary(ctx, recipients, ctx.data?.bulkAirtime);
  }

  async showBulkRecipientSummary(ctx, recipients, bulkExtra = {}) {
    const bulk = { ...(ctx.data?.bulkAirtime || bulkExtra), recipients };
    const lines = recipients
      .slice(0, 15)
      .map((r, i) => `${i + 1}. ${r.name} — ${r.phone}`)
      .join('\n');
    const more = recipients.length > 15 ? `\n_…and ${recipients.length - 15} more_` : '';

    await this.buttons(
      ctx.phone,
      `*Recipients (${recipients.length})*\n\n${lines}${more}\n\nAdd more or continue.`,
      [
        { id: 'bulk_continue', title: 'Continue' },
        { id: 'bulk_clear', title: 'Clear all' },
      ]
    );
    await this.updateSession(ctx.phone, {
      step: this.STEPS.BULK_RECIPIENTS,
      data: { bulkAirtime: bulk },
    });
  }

  async showBulkConfirm(ctx, bulk) {
    const count = bulk.recipients.length;
    const totalBase = bulk.amount * count;
    const afford = await wallet.canAffordPurchase(ctx.phone, totalBase);
    const pricing = wallet.formatWalletSummary(totalBase);

    if (!afford.ok) {
      const { sendTopUpPrompt } = require('../../wallet/purchaseHelper');
      await this.reply(
        ctx.phone,
        `💳 *Not enough balance*\n\n` +
          `${count} × ${wallet.formatNaira(bulk.amount)} = ${wallet.formatNaira(totalBase)}\n` +
          `${pricing.text}\n\nBalance: *${wallet.formatNaira(afford.balance)}*`
      );
      return sendTopUpPrompt(ctx.phone, afford.shortfall, 'bulk airtime');
    }

    const preview = bulk.recipients
      .slice(0, 8)
      .map((r) => `• ${r.name} (${r.phone})`)
      .join('\n');
    const more = count > 8 ? `\n_…and ${count - 8} more_` : '';

    await this.buttons(
      ctx.phone,
      `*Confirm bulk airtime*\n\n` +
        `Network: *${bulk.network}*\n` +
        `Each: *${wallet.formatNaira(bulk.amount)}*\n` +
        `Recipients: *${count}*\n\n` +
        `${preview}${more}\n\n${pricing.text}`,
      [
        { id: 'bulk_confirm', title: 'Pay & send all' },
        { id: 'air_cancel', title: 'Cancel' },
      ]
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.BULK_CONFIRM, data: { bulkAirtime: bulk } });
  }

  async executeBulkPurchase(ctx, bulk) {
    const count = bulk.recipients.length;
    const totalBase = bulk.amount * count;
    const summary = `${bulk.network} airtime ×${count} @ ${wallet.formatNaira(bulk.amount)}`;

    const purchase = await confirmAndPay(ctx.phone, {
      service: 'airtime',
      baseAmount: totalBase,
      summaryText: summary,
      execute: async () => {
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
        if (!okCount) {
          return { ok: false, message: results[0]?.message || 'All transfers failed' };
        }
        const failed = results.filter((x) => !x.ok);
        const lines = results
          .filter((x) => x.ok)
          .slice(0, 10)
          .map((x) => `✓ ${x.name} (${x.phone})`)
          .join('\n');
        let msg = `Sent to *${okCount}/${count}* numbers.\n${lines}`;
        if (failed.length) {
          msg += `\n\n_${failed.length} failed — wallet refund applies to failed portion if applicable._`;
        }
        return { ok: true, message: msg, results };
      },
    });

    if (isCheckoutPending(purchase)) return;

    if (purchase?.ok) {
      await this.reply(
        ctx.phone,
        `✅ *Bulk airtime complete!*\n\n${purchase.result?.message || ''}\n\nRef: *${purchase.reference}*`
      );
    } else if (!purchase?.prompted && !purchase?.insufficient) {
      await this.reply(ctx.phone, `❌ ${purchase?.message || 'Bulk purchase failed.'}`);
    }
    return this.showMenu(ctx);
  }

  async showContactsMenu(ctx) {
    const contacts = await contactStore.listContacts(ctx.phone);
    if (!contacts.length) {
      await this.reply(ctx.phone, contactStore.contactsHelpText());
      return this.showMenu(ctx);
    }

    const lines = contacts
      .slice(0, 20)
      .map((c) => contactStore.formatContactLine(c))
      .join('\n');
    await this.reply(
      ctx.phone,
      `*📇 Your saved contacts*\n\n${lines}\n\n` +
        `_Edit: *edit Name 080…* · Delete: *delete Name*_\n\n` +
        `_Order: *MTN 500 airtime for Mama*_`
    );
    return this.showMenu(ctx);
  }

  async trySaveContactFromText(ctx, text) {
    const m = String(text || '').match(/^save\s+contact\s+(.+?)\s+(0\d{10}|234\d{10})\s*$/i);
    if (!m) return false;
    const name = m[1].trim();
    const result = await contactStore.saveContact(ctx.phone, { name, phone: m[2] });
    if (result.ok) {
      await this.reply(ctx.phone, `✅ Saved *${result.contact.name}* — ${result.contact.phone}`);
    } else {
      await this.reply(ctx.phone, `❌ ${result.message}`);
    }
    return true;
  }

  async showBulkAmountPicker(ctx, bulk) {
    const count = bulk.recipients.length;
    const rows = AIRTIME_AMOUNTS.map((amt) => ({
      id: `bulk_amt_${amt}`,
      title: formatAmountTitle(amt),
      description: `${count} × ${wallet.formatNaira(amt)}`,
    }));
    rows.push({ id: 'bulk_amt_custom', title: 'Other amount', description: 'Type amount' });
    await this.list(
      ctx.phone,
      `*${bulk.network} — ${count} recipients*\n\nPick airtime *per person*:`,
      'Amounts',
      [{ title: 'Per person', rows: rows.slice(0, 10) }]
    );
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_AMOUNT,
      data: { bulkAirtime: bulk, airtime: { type: 'airtime', network: bulk.network } },
    });
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

    if (isCheckoutPending(purchase)) return;

    if (purchase?.ok) {
      const note = purchase.result?.pendingWebhook ? '\n_Delivering to the line now…_' : '';
      await this.reply(
        ctx.phone,
        `✅ *${isDataFlow(airtime) ? 'Data' : 'Airtime'} sent!*\n\n` +
          `${airtime.network} → ${airtime.phone}\n\n` +
          `${purchase.result?.message ? `${purchase.result.message}\n\n` : ''}` +
          `Ref: *${purchase.reference}*\n` +
          `Paid: ${wallet.formatNaira(purchase.total)}\n` +
          (purchase.balance != null ? `Balance: ${wallet.formatNaira(purchase.balance)}\n` : '') +
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
    const bulk = data?.bulkAirtime;

    if (await this.trySaveContactFromText(ctx, text)) return;

    if (ctx.contacts && (step === this.STEPS.BULK_RECIPIENTS || step === this.STEPS.ENTER_PHONE)) {
      if (step === this.STEPS.ENTER_PHONE && airtime) {
        const shared = contactStore.parseSharedContacts({ contacts: ctx.contacts });
        if (shared[0]) {
          await contactStore.saveContact(ctx.phone, shared[0]);
          return this.continueWithPhone(
            ctx,
            { ...airtime, contactName: shared[0].name, recipientType: 'other' },
            shared[0].phone
          );
        }
      }
      return this.addBulkRecipients(ctx, { contacts: ctx.contacts, text: '' });
    }

    // ── Entry points ──
    if (choice === 'airtime_buy') return this.startAirtimeFlow(ctx);
    if (choice === 'airtime_data') return this.startDataFlow(ctx);
    if (choice === 'airtime_bulk') return this.startBulkFlow(ctx);
    if (choice === 'airtime_contacts') return this.showContactsMenu(ctx);

    // ── Network (must match current flow type) ──
    if (choice?.startsWith('net_')) {
      const network = networkFromChoice(choice);
      if (!network) return this.showMenu(ctx);

      if (isDataFlow(airtime) || (step === this.STEPS.PICK_NETWORK && data?.airtime?.type === 'data')) {
        const next = {
          type: 'data',
          network,
          phone: airtime?.phone,
          recipientType: airtime?.recipientType,
          contactName: airtime?.contactName,
          networkAuto: false,
        };
        if (next.phone) return this.showDataPeriodPicker(ctx, next);
        return this.showRecipientPicker(ctx, next);
      }
      if (isAirtimeFlow(airtime) || data?.airtime?.type === 'airtime') {
        const next = {
          type: 'airtime',
          network,
          phone: airtime?.phone,
          recipientType: airtime?.recipientType,
          contactName: airtime?.contactName,
          networkAuto: false,
        };
        if (next.phone) return this.showAirtimeAmounts(ctx, next);
        return this.showRecipientPicker(ctx, next);
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
      const selfPhone = toLocalPhone(ctx.phone);
      if (isDataFlow(airtime) || isAirtimeFlow(airtime) || airtime?.type) {
        return this.continueWithPhone(
          ctx,
          { ...airtime, type: airtime.type || 'airtime', recipientType: 'self' },
          selfPhone
        );
      }
      return this.showMenu(ctx);
    }

    if (choice === 'air_other' && airtime) {
      await this.reply(
        ctx.phone,
        'Send the recipient number, a *saved contact name*, or *share their contact card* from WhatsApp:\n_e.g. 08012345678 or Mama_\n\n_Network will be detected automatically._'
      );
      await this.updateSession(ctx.phone, {
        step: this.STEPS.ENTER_PHONE,
        data: { airtime: { ...airtime, recipientType: 'other' } },
      });
      return;
    }

    if (choice === 'air_change_network' && airtime) {
      return this.showNetworkPicker(ctx, isDataFlow(airtime) ? 'data' : 'airtime');
    }

    // ── Bulk airtime ──
    if (choice === 'bulk_clear' && bulk) {
      return this.startBulkFlow(ctx);
    }
    if (choice === 'bulk_continue' && bulk?.recipients?.length) {
      const first = bulk.recipients[0]?.phone;
      const network = detectNetworkOrNull(first) || bulk.network;
      if (!network) {
        await this.reply(ctx.phone, 'Pick the network for this bulk send:');
        await this.showNetworkPicker(ctx, 'airtime');
        await this.updateSession(ctx.phone, {
          step: this.STEPS.PICK_NETWORK,
          data: { bulkAirtime: { ...bulk, type: 'airtime' }, airtime: { type: 'airtime' } },
        });
        return;
      }
      const nextBulk = { ...bulk, type: 'airtime', network };
      await this.reply(
        ctx.phone,
        `📡 Detected *${network}* from ${first}.\n_If any number is on another network, send those separately._`
      );
      return this.showBulkAmountPicker(ctx, nextBulk);
    }
    if (choice === 'bulk_confirm' && bulk) {
      return this.executeBulkPurchase(ctx, bulk);
    }
    if (step === this.STEPS.BULK_RECIPIENTS && bulk && text?.trim()) {
      return this.addBulkRecipients(ctx, { text, contacts: null });
    }
    if (step === this.STEPS.BULK_CONFIRM && bulk && isAffirmation(text)) {
      return this.executeBulkPurchase(ctx, bulk);
    }

    if (choice?.startsWith('net_') && bulk?.recipients?.length && !airtime?.phone) {
      const network = networkFromChoice(choice);
      if (!network) return this.showMenu(ctx);
      return this.showBulkAmountPicker(ctx, { ...bulk, network, type: 'airtime' });
    }

    if (choice?.startsWith('bulk_amt_') && bulk) {
      if (choice === 'bulk_amt_custom') {
        await this.reply(ctx.phone, `Enter amount per person (min ${wallet.formatNaira(MIN_AIRTIME_AMOUNT)}):`);
        await this.updateSession(ctx.phone, { step: this.STEPS.ENTER_AMOUNT, data: { bulkAirtime: bulk } });
        return;
      }
      const amount = Number(choice.replace('bulk_amt_', ''));
      if (amount >= MIN_AIRTIME_AMOUNT) {
        return this.showBulkConfirm(ctx, { ...bulk, amount });
      }
    }

    if (step === this.STEPS.ENTER_AMOUNT && bulk && isAirtimeFlow({ type: 'airtime' })) {
      const amount = parseFloat(String(text || '').replace(/[₦,]/g, ''));
      if (amount >= MIN_AIRTIME_AMOUNT) {
        return this.showBulkConfirm(ctx, { ...bulk, amount });
      }
      await this.reply(ctx.phone, `Minimum ${wallet.formatNaira(MIN_AIRTIME_AMOUNT)} per person.`);
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
      let phone = toLocalPhone(text);
      if (!phone || phone.length < 11) {
        const named = await contactStore.resolveContactName(ctx.phone, text.trim());
        if (named.ok) phone = named.contact.phone;
        else if (named.ambiguous) {
          await this.reply(
            ctx.phone,
            `Several matches for *${text.trim()}*:\n` +
              named.matches.map((m) => `• ${m.name} — ${m.phone}`).join('\n') +
              `\n\nReply with the exact name or number.`
          );
          return;
        } else if (text.trim().length >= 2) {
          await this.reply(ctx.phone, `${named.message}\n\nOr send their phone number.`);
          return;
        }
      }
      if (!phone || phone.length < 11) {
        await this.reply(ctx.phone, 'Enter a valid Nigerian number (11 digits), saved name, or share a contact card.');
        return;
      }
      const next = { ...airtime, phone };
      return this.continueWithPhone(ctx, next, phone);
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
