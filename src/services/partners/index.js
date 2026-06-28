const BaseService = require('../BaseService');
const partnerStore = require('../../stores/partnerStore');
const { confirmAndPay, isCheckoutPending } = require('../../wallet/purchaseHelper');
const wallet = require('../../wallet/walletService');
const { formatCatalogListRow } = require('../../utils/vtuCatalog');

const CATEGORIES = ['Food', 'Fashion', 'Beauty', 'Electronics', 'Services', 'Health', 'Education', 'Other'];

class PartnersService extends BaseService {
  constructor() {
    super('partners', {
      name: 'Partner Services',
      emoji: '🤝',
      description: 'Businesses on Mysogi',
      steps: {
        MENU: 'menu',
        REGISTER: 'register',
        BUY: 'buy',
      },
    });
  }

  async showMenu(ctx) {
    if (!(await this.ensureAuth(ctx))) return;

    const services = await partnerStore.getActivePartnerServices(8);

    const rows = [
      { id: 'partner_add', title: '➕ Add your business', description: 'List on Mysogi' },
      { id: 'partner_mine', title: '📋 My businesses', description: 'Manage listings' },
    ];

    for (const s of services.slice(0, 6)) {
      const biz = s.business_partners?.business_name || 'Partner';
      const row = formatCatalogListRow({ name: s.name, amount: s.price, subtitle: biz });
      rows.push({
        id: `partner_${s.id}`,
        title: row.title,
        description: row.description,
      });
    }

    await this.list(
      ctx.phone,
      `*🤝 Partner Services*\n\nBusinesses offering services on Mysogi. Buy with your wallet balance.`,
      'Partners',
      [{ title: 'Browse & list', rows: rows.slice(0, 10) }]
    );
    await this.updateSession(ctx.phone, { step: this.STEPS.MENU });
  }

  async handle(ctx) {
    if (this.isHome(ctx.text)) return this.goHome(ctx.phone);
    if (this.isCancel(ctx.text)) {
      await this.reply(ctx.phone, 'Cancelled.');
      return this.goHome(ctx.phone);
    }

    const { choice, step, text, data } = ctx;

    if (choice === 'partner_add') {
      await this.reply(
        ctx.phone,
        `*Add your business to Mysogi*\n\n` +
          `Send details in *one line* separated by *|*\n\n` +
          `*Format:*\nBusiness name | Category | Description | Service name | Price\n\n` +
          `*Example:*\nAda Beauty | Beauty | Home service salon | Hair styling | 5000\n\n` +
          `Categories: ${CATEGORIES.join(', ')}`
      );
      await this.updateSession(ctx.phone, { step: this.STEPS.REGISTER });
      return;
    }

    if (step === this.STEPS.REGISTER) {
      const parts = text.split('|').map((p) => p.trim());
      if (parts.length < 5) {
        await this.reply(ctx.phone, 'Need 5 parts: Business | Category | Description | Service | Price');
        return;
      }
      const [businessName, category, description, serviceName, price] = parts;
      const result = await partnerStore.registerPartner({
        ownerPhone: ctx.phone,
        businessName,
        category,
        description,
        serviceName,
        serviceDescription: description,
        price,
      });

      if (!result.ok) {
        await this.reply(ctx.phone, `❌ ${result.message}`);
        return this.showMenu(ctx);
      }

      await this.reply(
        ctx.phone,
        `✅ *${businessName}* is now live on Mysogi!\n\n` +
          `Service: ${serviceName} — ${wallet.formatNaira(price)}\n\n` +
          `Customers will see it in *Partner Services* on the main menu.`
      );
      return this.showMenu(ctx);
    }

    if (choice === 'partner_mine') {
      const mine = await partnerStore.getPartnersByOwner(ctx.phone);
      if (!mine.length) {
        await this.reply(ctx.phone, 'You have no businesses listed yet. Tap *Add your business*.');
        return this.showMenu(ctx);
      }
      const lines = mine.flatMap((p) =>
        (p.business_services || []).map((s) => `• ${p.business_name}: ${s.name} — ${wallet.formatNaira(s.price)}`)
      );
      await this.reply(ctx.phone, `*Your businesses*\n\n${lines.join('\n')}`);
      return this.showMenu(ctx);
    }

    if (choice?.startsWith('partner_') && choice !== 'partner_add' && choice !== 'partner_mine') {
      const serviceId = choice.replace('partner_', '');
      const service = await partnerStore.getServiceById(serviceId);
      if (!service) {
        await this.reply(ctx.phone, 'Service not found.');
        return this.showMenu(ctx);
      }

      const biz = service.business_partners?.business_name || 'Partner';
      const pricing = wallet.formatWalletSummary(service.price);

      await this.buttons(
        ctx.phone,
        `*${service.name}*\n` +
          `By: ${biz}\n` +
          `${service.description || ''}\n\n` +
          `${pricing.text}\n` +
          `Your balance: ${wallet.formatNaira(await wallet.getBalance(ctx.phone))}`,
        [{ id: `partner_buy_${serviceId}`, title: 'Pay with wallet' }, { id: 'partner_cancel', title: 'Cancel' }]
      );
      await this.updateSession(ctx.phone, { step: this.STEPS.BUY, data: { partnerService: service } });
      return;
    }

    if (step === this.STEPS.BUY && choice?.startsWith('partner_buy_')) {
      const service = data.partnerService;
      const purchase = await confirmAndPay(ctx.phone, {
        service: 'partners',
        baseAmount: service.price,
        summaryText: service.name,
        execute: async () => ({ ok: true, message: 'Order placed' }),
      });

      if (isCheckoutPending(purchase)) return;

      if (purchase.ok) {
        await this.reply(
          ctx.phone,
          `✅ *${service.name}* booked!\n\n` +
            `Ref: *${purchase.reference}*\n` +
            `Paid: ${wallet.formatNaira(purchase.total)} (incl. Mysogi fee)\n` +
            (purchase.balance != null ? `Balance: ${wallet.formatNaira(purchase.balance)}\n\n` : '\n') +
            `_${service.business_partners?.business_name} will contact you on WhatsApp._`
        );
      }
      return this.showMenu(ctx);
    }

    if (choice === 'partner_cancel') return this.showMenu(ctx);

    return this.showMenu(ctx);
  }
}

module.exports = PartnersService;
