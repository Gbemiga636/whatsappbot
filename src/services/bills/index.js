const BaseService = require('../BaseService');
const telecom = require('../../providers/telecomProvider');
const { confirmAndPay, confirmAndPayWithCredit, wallet, credit } = require('../../wallet/purchaseHelper');

class BillsService extends BaseService {
  constructor() {
    super('bills', {
      name: 'Bills & TV',
      emoji: '⚡',
      description: 'Electricity, DStv, GOtv',
      steps: { PICK_BILL: 'pick_bill', ENTER_METER: 'enter_meter', ENTER_AMOUNT: 'enter_amount', CONFIRM: 'confirm' },
    });
  }

  async showMenu(ctx) {
    const balance = await wallet.getBalance(ctx.phone);
    await this.list(ctx.phone, `*⚡ Bills & TV*\n\nWallet: ${wallet.formatNaira(balance)}`, 'Choose bill', [{
      title: 'Bill types',
      rows: [
        { id: 'bill_electric', title: '⚡ Electricity', description: 'IKEDC, EKEDC…' },
        { id: 'bill_dstv', title: '📺 DStv', description: 'Renew' },
        { id: 'bill_gotv', title: '📺 GOtv', description: 'Renew' },
        { id: 'bill_startimes', title: '📺 StarTimes', description: 'Renew' },
      ],
    }]);
    await this.updateSession(ctx.phone, { step: this.STEPS.MENU });
  }

  async handle(ctx) {
    if (this.isHome(ctx.text)) return this.goHome(ctx.phone);
    if (this.isCancel(ctx.text)) { await this.reply(ctx.phone, 'Cancelled.'); return this.goHome(ctx.phone); }

    const { choice, step, data, text } = ctx;
    const billTypes = { bill_electric: 'electricity', bill_dstv: 'dstv', bill_gotv: 'gotv', bill_startimes: 'startimes' };

    if (billTypes[choice]) {
      const type = billTypes[choice];
      const prompt = type === 'electricity'
        ? 'Enter *meter number* and *provider* (comma-separated).\n\nExample: 45012345678, IKEDC'
        : `Enter your *${type.toUpperCase()}* smartcard number:`;
      await this.reply(ctx.phone, prompt);
      await this.updateSession(ctx.phone, { step: this.STEPS.ENTER_METER, data: { bill: { type } } });
      return;
    }

    if (step === this.STEPS.ENTER_METER) {
      const bill = { ...data.bill };
      if (bill.type === 'electricity') {
        const [meter, provider] = text.split(',').map((s) => s.trim());
        if (!meter || !provider) { await this.reply(ctx.phone, 'Format: MeterNumber, Provider'); return; }
        bill.meter = meter;
        bill.provider = provider;
      } else {
        bill.smartcard = text.trim();
      }
      await this.reply(ctx.phone, 'Enter amount in Naira (e.g. 5000):');
      await this.updateSession(ctx.phone, { step: this.STEPS.ENTER_AMOUNT, data: { bill } });
      return;
    }

    if (step === this.STEPS.ENTER_AMOUNT) {
      const amount = parseFloat(text.replace(/[₦,]/g, ''));
      if (!amount || amount < 100) { await this.reply(ctx.phone, 'Minimum ₦100.'); return; }
      const bill = { ...data.bill, amount };
      const pricing = wallet.formatWalletSummary(amount);
      const buttons = [
        { id: 'bill_confirm', title: 'Pay from wallet' },
        { id: 'bill_cancel', title: 'Cancel' },
      ];
      const eligibility = await credit.checkEligibility(ctx.phone, amount);
      if (eligibility.ok) {
        buttons.splice(1, 0, { id: 'bill_credit', title: '⚡ Pay with credit' });
      }
      await this.buttons(
        ctx.phone,
        `*Confirm payment*\n\nType: ${bill.type}\n${pricing.text}`,
        buttons.slice(0, 3)
      );
      await this.updateSession(ctx.phone, { step: this.STEPS.CONFIRM, data: { bill } });
      return;
    }

    if (step === this.STEPS.CONFIRM && choice === 'bill_credit') {
      const bill = data.bill;
      await confirmAndPayWithCredit(ctx.phone, {
        service: 'bills',
        baseAmount: bill.amount,
        summaryText: `${bill.type} bill`,
        execute: () => telecom.payBill({ ...bill, phone: ctx.phone }),
      });
      return this.showMenu(ctx);
    }

    if (step === this.STEPS.CONFIRM && choice === 'bill_confirm') {
      const bill = data.bill;
      const purchase = await confirmAndPay(ctx.phone, {
        service: 'bills',
        baseAmount: bill.amount,
        summaryText: `${bill.type} bill`,
        execute: () => telecom.payBill({ ...bill, phone: ctx.phone }),
      });

      if (purchase.ok) {
        const token = purchase.result?.token || purchase.result?.message || '';
        await this.reply(
          ctx.phone,
          `✅ *Bill paid!*\n\nRef: *${purchase.reference}*\n${token ? `Token: ${token}\n` : ''}` +
            `Paid: ${wallet.formatNaira(purchase.total)}\nBalance: ${wallet.formatNaira(purchase.balance)}`
        );
      }
      return this.showMenu(ctx);
    }

    return this.showMenu(ctx);
  }
}

module.exports = BillsService;
