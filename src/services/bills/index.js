const BaseService = require('../BaseService');
const telecom = require('../../providers/telecomProvider');
const { confirmAndPay, wallet } = require('../../wallet/purchaseHelper');
const {
  paginateItems,
  formatCatalogListRow,
  formatProviderListRow,
  formatCatalogPagePreamble,
  formatAmountTitle,
  PAGE_SIZE,
} = require('../../utils/vtuCatalog');

const ELECTRIC_AMOUNTS = [1000, 2000, 5000, 10000, 20000];
const BETTING_AMOUNTS = [500, 1000, 2000, 5000, 10000];

class BillsService extends BaseService {
  constructor() {
    super('bills', {
      name: 'Bills & Pay',
      emoji: '⚡',
      description: 'Electricity, TV, betting',
      steps: {
        PICK_BILL: 'pick_bill',
        PICK_DISCO: 'pick_disco',
        PICK_PACKAGE: 'pick_package',
        PICK_BOOKMAKER: 'pick_bookmaker',
        ENTER_DETAIL: 'enter_detail',
        PICK_AMOUNT: 'pick_amount',
        ENTER_AMOUNT: 'enter_amount',
        CONFIRM: 'confirm',
      },
    });
  }

  async showMenu(ctx) {
    const balance = await wallet.getBalance(ctx.phone);
    await this.list(ctx.phone, `*⚡ Bills & Pay*\n\nWallet: ${wallet.formatNaira(balance)}`, 'Choose', [{
      title: 'Services',
      rows: [
        { id: 'bill_electric', title: '⚡ Electricity', description: 'All discos' },
        { id: 'bill_dstv', title: '📺 DStv', description: 'Pick bouquet' },
        { id: 'bill_gotv', title: '📺 GOtv', description: 'Pick bouquet' },
        { id: 'bill_startimes', title: '📺 StarTimes', description: 'Pick bouquet' },
        { id: 'bill_betting', title: '🎰 Betting', description: 'Fund account' },
      ],
    }]);
    await this.updateSession(ctx.phone, { step: this.STEPS.MENU, data: {} });
  }

  async showTvPicker(ctx) {
    await this.list(ctx.phone, '*📺 TV subscription*\n\nSelect your provider:', 'TV', [{
      title: 'Provider',
      rows: [
        { id: 'bill_dstv', title: '📺 DStv', description: 'Pick bouquet' },
        { id: 'bill_gotv', title: '📺 GOtv', description: 'Pick bouquet' },
        { id: 'bill_startimes', title: '📺 StarTimes', description: 'Pick bouquet' },
      ],
    }]);
    await this.updateSession(ctx.phone, { step: this.STEPS.MENU, data: {} });
  }

  async showDiscoPicker(ctx) {
    const discos = await telecom.getElectricityDiscos();
    if (!discos.length) {
      await this.reply(ctx.phone, 'Electricity providers unavailable. Try again later.');
      return this.showMenu(ctx);
    }

    const { items, hasMore } = paginateItems(discos, 0);
    const rows = items.map((d, i) => {
      const row = formatProviderListRow({ name: d.name, code: d.code });
      return { id: `disco_${i}`, title: row.title, description: row.description };
    });
    if (hasMore) rows.push({ id: 'disco_page_1', title: '➡️ More discos', description: 'Next page' });

    await this.list(ctx.phone, '*⚡ Electricity*\n\nSelect your disco:', 'Discos', [{ title: 'Provider', rows: rows.slice(0, 10) }]);
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_DISCO,
      data: { bill: { type: 'electricity' }, discos },
    });
  }

  async showBookmakerPicker(ctx, page = 0) {
    const bookmakers = await telecom.getBettingBookmakers();
    if (!bookmakers.length) {
      await this.reply(ctx.phone, 'Betting providers unavailable. Try again later.');
      return this.showMenu(ctx);
    }

    const { items, hasMore } = paginateItems(bookmakers, page);
    const rows = items.map((b, i) => {
      const row = formatProviderListRow({ name: b.name, subtitle: 'Fund account' });
      return { id: `bet_${page * PAGE_SIZE + i}`, title: row.title, description: row.description };
    });
    if (hasMore) rows.push({ id: `bet_page_${page + 1}`, title: '➡️ More', description: 'Next page' });

    await this.list(ctx.phone, '*🎰 Betting*\n\nSelect bookmaker:', 'Bookmakers', [{ title: 'Platform', rows: rows.slice(0, 10) }]);
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_BOOKMAKER,
      data: { bill: { type: 'betting' }, bookmakers, betPage: page },
    });
  }

  async showCablePackages(ctx, billType, smartcard, page = 0) {
    const packages = await telecom.getCablePackages(billType);
    if (!packages.length) {
      await this.reply(ctx.phone, `No ${billType.toUpperCase()} packages found. Try again later.`);
      return this.showMenu(ctx);
    }

    const { items, hasMore, total } = paginateItems(packages, page);
    const rows = items.map((p, i) => {
      const row = formatCatalogListRow({ name: p.name, amount: p.amount });
      return { id: `pkg_${page * PAGE_SIZE + i}`, title: row.title, description: row.description };
    });

    if (page > 0) {
      rows.unshift({ id: `pkg_page_${page - 1}`, title: '⬅️ Previous', description: 'Earlier packages' });
    }
    if (hasMore) {
      rows.push({ id: `pkg_page_${page + 1}`, title: '➡️ More plans', description: `Page ${page + 2} of ${Math.ceil(total / PAGE_SIZE)}` });
    }

    const preamble = formatCatalogPagePreamble(items, {
      getLabel: (p) => p.name,
      getAmount: (p) => p.amount,
    });

    const body =
      `*📺 ${billType.toUpperCase()}*\n` +
      `Smartcard: *${smartcard}*\n` +
      `${total} package(s) — page ${page + 1}\n\n` +
      `*Plans on this page:*\n${preamble}\n\n` +
      `_Tap a package below. Price is on the left; plan name is on the right._`;

    await this.list(ctx.phone, body, 'Packages', [{ title: 'Bouquets', rows: rows.slice(0, 10) }]);
    await this.updateSession(ctx.phone, {
      step: this.STEPS.PICK_PACKAGE,
      data: { bill: { type: billType, smartcard }, packages, pkgPage: page },
    });
  }

  async showAmountPicker(ctx, bill, amounts, label) {
    const rows = amounts.map((amt) => ({
      id: `bill_amt_${amt}`,
      title: formatAmountTitle(amt),
      description: label,
    }));
    rows.push({ id: 'bill_amt_custom', title: 'Other amount', description: 'Type amount' });

    await this.list(ctx.phone, `*${label}*\n\nSelect amount:`, 'Amount', [{ title: 'Quick amounts', rows: rows.slice(0, 10) }]);
    await this.updateSession(ctx.phone, { step: this.STEPS.PICK_AMOUNT, data: { bill } });
  }

  async showConfirm(ctx, bill) {
    const afford = await wallet.canAffordPurchase(ctx.phone, bill.amount);
    if (!afford.ok) {
      await this.reply(
        ctx.phone,
        `💳 *Insufficient balance*\n\n` +
          `Amount: ${wallet.formatNaira(afford.base)}\n` +
          `Mysogi fee: ${wallet.formatNaira(afford.commission)}\n` +
          `*Total needed: ${wallet.formatNaira(afford.total)}*\n\n` +
          `Your balance: *${wallet.formatNaira(afford.balance)}*\n` +
          `Short by: *${wallet.formatNaira(afford.shortfall)}*`
      );
      const { sendTopUpPrompt } = require('../../wallet/purchaseHelper');
      await sendTopUpPrompt(ctx.phone, afford.shortfall, 'this payment');
      return;
    }

    const pricing = wallet.formatWalletSummary(bill.amount);
    const buttons = [
      { id: 'bill_confirm', title: '✅ Pay now' },
      { id: 'bill_cancel', title: 'Cancel' },
    ];

    let summary = `Type: *${bill.type}*\nAmount: *${wallet.formatNaira(bill.amount)}*`;
    if (bill.type === 'electricity') summary += `\nDisco: ${bill.providerName || bill.provider}\nMeter: ${bill.meter}`;
    if (bill.smartcard) summary += `\nSmartcard: ${bill.smartcard}`;
    if (bill.packageName) summary += `\nPackage: ${bill.packageName}`;
    if (bill.type === 'betting') summary += `\n${bill.bookmakerName}\nID: ${bill.customerId}`;

    await this.buttons(ctx.phone, `*Confirm payment*\n\n${summary}\n\n${pricing.text}`, buttons.slice(0, 3));
    await this.updateSession(ctx.phone, { step: this.STEPS.CONFIRM, data: { bill } });
  }

  async executePayment(ctx, bill) {
    const opts = {
      service: 'bills',
      baseAmount: bill.amount,
      summaryText: `${bill.type} payment`,
      execute: () => telecom.payBill({ ...bill, phone: ctx.phone }),
    };
    const purchase = await confirmAndPay(ctx.phone, opts);

    if (purchase?.awaitingPin || purchase?.awaitingPinSetup || purchase?.locked) return;

    if (purchase?.ok) {
      const token = purchase.result?.token;
      await this.reply(
        ctx.phone,
        `✅ *Payment successful!*\n\nRef: *${purchase.reference}*\n` +
          (token && token !== 'successful' ? `Token: ${token}\n` : '') +
          `${purchase.result?.message ? `${purchase.result.message}\n` : ''}` +
          `Paid: ${wallet.formatNaira(purchase.total)}\nBalance: ${wallet.formatNaira(purchase.balance)}`
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
    if (this.isCancel(ctx.text) || ctx.choice === 'bill_cancel') {
      await this.reply(ctx.phone, 'Cancelled.');
      return this.goHome(ctx.phone);
    }

    const { choice, step, data, text } = ctx;

    if (choice === 'bill_electric') return this.showDiscoPicker(ctx);
    if (choice === 'bill_betting') return this.showBookmakerPicker(ctx);

    if (choice === 'bill_dstv' || choice === 'bill_gotv' || choice === 'bill_startimes') {
      const type = choice.replace('bill_', '');
      await this.reply(ctx.phone, `Enter your *${type.toUpperCase()}* smartcard / IUC number:`);
      await this.updateSession(ctx.phone, {
        step: this.STEPS.ENTER_DETAIL,
        data: { bill: { type } },
      });
      return;
    }

    if (choice?.startsWith('disco_') && data.discos) {
      const idx = Number(choice.replace('disco_', ''));
      const disco = data.discos[idx];
      if (!disco) return this.showDiscoPicker(ctx);
      await this.reply(ctx.phone, `*${disco.name}*\n\nEnter your *meter number*:`);
      await this.updateSession(ctx.phone, {
        step: this.STEPS.ENTER_DETAIL,
        data: {
          bill: {
            type: 'electricity',
            provider: disco.code,
            providerName: disco.name,
            productId: disco.id,
          },
        },
      });
      return;
    }

    if (choice?.startsWith('bet_page_')) {
      const page = Number(choice.replace('bet_page_', ''));
      return this.showBookmakerPicker(ctx, page);
    }

    if (choice?.startsWith('bet_') && data.bookmakers) {
      const idx = Number(choice.replace('bet_', ''));
      const bookmaker = data.bookmakers[idx];
      if (!bookmaker) return this.showBookmakerPicker(ctx, data.betPage || 0);
      await this.reply(ctx.phone, `*${bookmaker.name}*\n\nEnter your *Customer / User ID*:`);
      await this.updateSession(ctx.phone, {
        step: this.STEPS.ENTER_DETAIL,
        data: {
          bill: {
            type: 'betting',
            productId: bookmaker.id,
            bookmakerName: bookmaker.name,
          },
        },
      });
      return;
    }

    if (choice === 'bill_confirm' && data.bill) {
      return this.executePayment(ctx, data.bill);
    }

    if (choice?.startsWith('bill_amt_') && data.bill) {
      if (choice === 'bill_amt_custom') {
        await this.reply(ctx.phone, 'Enter amount in Naira (min ₦100):');
        await this.updateSession(ctx.phone, { step: this.STEPS.ENTER_AMOUNT, data });
        return;
      }
      const amount = Number(choice.replace('bill_amt_', ''));
      if (!amount || amount < 100) {
        await this.reply(ctx.phone, 'Minimum ₦100.');
        return;
      }
      return this.showConfirm(ctx, { ...data.bill, amount });
    }

    if (choice?.startsWith('pkg_') && data.packages && data.bill) {
      if (choice.startsWith('pkg_page_')) {
        const page = Number(choice.replace('pkg_page_', ''));
        return this.showCablePackages(ctx, data.bill.type, data.bill.smartcard, page);
      }
      const idx = Number(choice.replace('pkg_', ''));
      const pkg = data.packages[idx];
      if (!pkg) {
        return this.showCablePackages(ctx, data.bill.type, data.bill.smartcard, data.pkgPage || 0);
      }
      const bill = {
        ...data.bill,
        amount: pkg.amount,
        productId: pkg.productId,
        variationCode: pkg.variationCode,
        packageName: pkg.name,
        variation: pkg,
      };
      return this.showConfirm(ctx, bill);
    }

    if (choice === 'disco_page_1' && data.discos) {
      const { items } = paginateItems(data.discos, 1);
      const rows = items.map((d, i) => {
        const row = formatProviderListRow({ name: d.name, code: d.code });
        return { id: `disco_${PAGE_SIZE + i}`, title: row.title, description: row.description };
      });
      await this.list(ctx.phone, '*More discos*', 'Discos', [{ title: 'Provider', rows: rows.slice(0, 10) }]);
      return;
    }

    if (step === this.STEPS.ENTER_DETAIL) {
      const bill = { ...data.bill };

      if (bill.type === 'electricity') {
        bill.meter = text.trim();
        if (!bill.meter) {
          await this.reply(ctx.phone, 'Enter a valid meter number.');
          return;
        }
        return this.showAmountPicker(ctx, bill, ELECTRIC_AMOUNTS, `${bill.providerName || bill.provider} electricity`);
      }

      if (bill.type === 'betting') {
        bill.customerId = text.trim();
        if (!bill.customerId) {
          await this.reply(ctx.phone, 'Enter your betting account ID.');
          return;
        }
        return this.showAmountPicker(ctx, bill, BETTING_AMOUNTS, bill.bookmakerName);
      }

      bill.smartcard = text.trim();
      if (!bill.smartcard) {
        await this.reply(ctx.phone, 'Enter a valid smartcard number.');
        return;
      }
      return this.showCablePackages(ctx, bill.type, bill.smartcard);
    }

    if (step === this.STEPS.ENTER_AMOUNT) {
      const amount = parseFloat(text.replace(/[₦,]/g, ''));
      if (!amount || amount < 100) {
        await this.reply(ctx.phone, 'Minimum ₦100.');
        return;
      }
      return this.showConfirm(ctx, { ...data.bill, amount });
    }

    if (step && step !== this.STEPS.MENU && data?.bill) {
      await this.reply(ctx.phone, '_Use the buttons/list above, or type *menu* to go home._');
      return;
    }

    return this.showMenu(ctx);
  }
}

module.exports = BillsService;
