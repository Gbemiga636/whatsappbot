const BaseService = require('../BaseService');
const wallet = require('../../wallet/walletService');
const transactionPin = require('../../security/transactionPin');
const { getTransactionsByPhone } = require('../../stores/transactionStore');

class WalletService extends BaseService {
  constructor() {
    super('wallet', {
      name: 'My Wallet',
      emoji: '💳',
      description: 'Balance & top-up',
      steps: {
        MENU: 'menu',
        TOPUP_CHOICE: 'topup_choice',
        TOPUP_OTHER_PHONE: 'topup_other_phone',
        TOPUP_AMOUNT: 'topup_amount',
      },
    });
  }

  async showMenu(ctx) {
    if (!(await this.ensureAuth(ctx))) return;

    const balance = await wallet.refreshWalletFromDb(ctx.phone);
    const pinSet = await transactionPin.isPinSetAsync(ctx.phone);
    const rows = [
      { id: 'wallet_topup_self', title: '➕ Top up for me', description: 'Add to my balance' },
      { id: 'wallet_topup_other', title: '🎁 For someone else', description: 'Top up their wallet' },
      { id: 'wallet_balance', title: '💰 Check balance', description: wallet.formatNaira(balance) },
      { id: 'wallet_history', title: '📋 History', description: 'Recent transactions' },
      pinSet
        ? { id: 'wallet_pin_change', title: '🔐 Change PIN', description: 'Secure web page' }
        : { id: 'wallet_pin_set', title: '🔐 Set PIN', description: 'Secure web page' },
    ];
    await this.list(
      ctx.phone,
      `*💳 My Mysogi Wallet*\n\nBalance: *${wallet.formatNaira(balance)}*\n\n` +
        `🔒 Transaction PIN: ${pinSet ? 'Active (secure page)' : 'Not set — tap Set PIN'}`,
      'Wallet',
      [{ title: 'Wallet', rows }]
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.MENU });
  }

  async showTopUpChoice(ctx) {
    await this.buttons(
      ctx.phone,
      '*Top up wallet*\n\nWho are you topping up for?',
      [
        { id: 'wallet_topup_self', title: 'For myself' },
        { id: 'wallet_topup_other', title: 'For someone else' },
      ]
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.TOPUP_CHOICE, data: {} });
  }

  async handle(ctx) {
    if (this.isHome(ctx.text)) return this.goHome(ctx.phone);
    if (this.isCancel(ctx.text)) {
      await this.reply(ctx.phone, 'Cancelled.');
      return this.goHome(ctx.phone);
    }

    const { choice, step, text, data } = ctx;

    if (
      choice === 'wallet_topup' ||
      choice === 'wallet_topup_self' ||
      choice === 'wallet_topup_other' ||
      text?.toLowerCase().includes('top up') ||
      text?.toLowerCase().includes('topup')
    ) {
      if (choice === 'wallet_topup_other') {
        await this.reply(
          ctx.phone,
          '🎁 *Top up for someone else*\n\nEnter their *WhatsApp phone number*.\n\n_e.g. 08012345678 or 2348012345678_'
        );
        await this.updateSession(ctx.phone, {
          step: this.STEPS.TOPUP_OTHER_PHONE,
          data: { topupType: 'gift' },
        });
        return;
      }
      if (choice === 'wallet_topup_self' || choice === 'wallet_topup') {
        await this.reply(ctx.phone, 'How much do you want to add to *your* wallet? (min ₦100)\n\n_e.g. 1000, 5000_');
        await this.updateSession(ctx.phone, {
          step: this.STEPS.TOPUP_AMOUNT,
          data: { topupType: 'self', beneficiaryPhone: ctx.phone },
        });
        return;
      }
      return this.showTopUpChoice(ctx);
    }

    if (step === this.STEPS.TOPUP_CHOICE) {
      if (choice === 'wallet_topup_self') {
        await this.reply(ctx.phone, 'How much do you want to add? (min ₦100)');
        await this.updateSession(ctx.phone, {
          step: this.STEPS.TOPUP_AMOUNT,
          data: { topupType: 'self', beneficiaryPhone: ctx.phone },
        });
        return;
      }
      if (choice === 'wallet_topup_other') {
        await this.reply(ctx.phone, 'Enter recipient *WhatsApp number*:\n\n_e.g. 08012345678_');
        await this.updateSession(ctx.phone, { step: this.STEPS.TOPUP_OTHER_PHONE, data: { topupType: 'gift' } });
        return;
      }
    }

    if (step === this.STEPS.TOPUP_OTHER_PHONE) {
      const recipient = wallet.normalizePhone(text);
      if (recipient.length < 12) {
        await this.reply(ctx.phone, 'Enter a valid Nigerian phone number.');
        return;
      }
      await this.reply(
        ctx.phone,
        `Recipient: *${wallet.formatPhoneDisplay(recipient)}*\n\nHow much do you want to send? (min ₦100)`
      );
      await this.updateSession(ctx.phone, {
        step: this.STEPS.TOPUP_AMOUNT,
        data: { topupType: 'gift', beneficiaryPhone: recipient },
      });
      return;
    }

    if (step === this.STEPS.TOPUP_AMOUNT) {
      const amount = parseFloat(text.replace(/[₦,]/g, ''));
      if (!amount || amount < 100) {
        await this.reply(ctx.phone, 'Enter at least ₦100.');
        return;
      }
      const topupData = data || {};
      return this.processTopUp(ctx.phone, amount, {
        topupType: topupData.topupType || 'self',
        beneficiaryPhone: topupData.beneficiaryPhone || ctx.phone,
      });
    }

    if (choice === 'wallet_balance') {
      const balance = await wallet.getBalance(ctx.phone);
      await this.reply(ctx.phone, `*Your balance:* ${wallet.formatNaira(balance)}`);
      return this.showMenu(ctx);
    }

    if (choice === 'wallet_history') {
      const txs = await getTransactionsByPhone(ctx.phone, 8);
      if (!txs.length) {
        await this.reply(ctx.phone, 'No transactions yet. Top up to get started!');
        return this.showMenu(ctx);
      }
      const lines = txs.map((t) => {
        const sign = t.type?.includes('topup') ? '+' : '−';
        const gift = t.metadata?.topup_type === 'gift' ? ' (gift)' : '';
        return `${sign}${wallet.formatNaira(t.amount)} · ${t.service}${gift} · ${t.status}`;
      });
      await this.reply(ctx.phone, `*Recent transactions*\n\n${lines.join('\n')}`);
      return this.showMenu(ctx);
    }

    return this.showMenu(ctx);
  }

  async processTopUp(payerPhone, amount, { topupType = 'self', beneficiaryPhone } = {}) {
    const isGift = topupType === 'gift';
    const beneficiary = wallet.normalizePhone(beneficiaryPhone || payerPhone);

    const result = await wallet.initiateTopUp(payerPhone, amount, {
      beneficiaryPhone: beneficiary,
      topupType: isGift ? 'gift' : 'self',
    });

    if (!result.ok) {
      await this.reply(payerPhone, `❌ ${result.message}`);
      return this.showMenu({ phone: payerPhone, step: this.STEPS.MENU, data: {} });
    }

    const whatsapp = require('../../whatsapp');

    if (isGift) {
      await this.reply(
        payerPhone,
        `*Gift top-up ${wallet.formatNaira(amount)}*\n\n` +
          `To: *${wallet.formatPhoneDisplay(beneficiary)}*\n\n` +
          `Tap below to pay with Paystack.\nTheir wallet updates automatically after payment.`
      );
    } else {
      await this.reply(
        payerPhone,
        `*Top up ${wallet.formatNaira(amount)}*\n\nTap below to pay with Paystack.\nYour wallet updates automatically after payment.\n\n_If you don't get a confirmation, send any message here after paying._`
      );
    }

    await whatsapp.sendCtaUrl(
      payerPhone,
      `Pay ${wallet.formatNaira(amount)} — card, bank transfer, or USSD.`,
      'Pay now',
      result.paymentUrl
    );

    await this.updateSession(payerPhone, {
      step: this.STEPS.MENU,
      data: { pendingTopUp: result.reference, topupType, beneficiaryPhone: beneficiary },
    });
  }
}

module.exports = WalletService;
