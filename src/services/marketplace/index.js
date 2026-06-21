const BaseService = require('../BaseService');

class MarketplaceService extends BaseService {
  constructor() {
    super('marketplace', { name: 'Marketplace', emoji: '🏪', description: 'Coming soon' });
  }
  async showMenu(ctx) {
    return this.showComingSoon(ctx, 'Buy & sell phones, cars, fashion & more inside WhatsApp.');
  }
  async handle(ctx) {
    if (this.isHome(ctx.text) || this.isHome(ctx.choice)) return this.goHome(ctx.phone);
    return this.showMenu(ctx);
  }
}

module.exports = MarketplaceService;
