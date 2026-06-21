const BaseService = require('../BaseService');

class BusinessService extends BaseService {
  constructor() {
    super('business', { name: 'Business Tools', emoji: '💼', description: 'Coming soon' });
  }
  async showMenu(ctx) {
    return this.showComingSoon(ctx, 'Invoices, CRM, payment collection & bulk campaigns for businesses.');
  }
  async handle(ctx) {
    if (this.isHome(ctx.text) || this.isHome(ctx.choice)) return this.goHome(ctx.phone);
    return this.showMenu(ctx);
  }
}

module.exports = BusinessService;
