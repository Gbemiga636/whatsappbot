const BaseService = require('../BaseService');

class BankingService extends BaseService {
  constructor() {
    super('banking', { name: 'Banking', emoji: '🏦', description: 'Coming soon' });
  }
  async showMenu(ctx) {
    return this.showComingSoon(ctx, 'Bank transfers, balance inquiry, virtual cards & savings.');
  }
  async handle(ctx) {
    if (this.isHome(ctx.text) || this.isHome(ctx.choice)) return this.goHome(ctx.phone);
    return this.showMenu(ctx);
  }
}

module.exports = BankingService;
