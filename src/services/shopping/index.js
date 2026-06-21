const BaseService = require('../BaseService');

class ShoppingService extends BaseService {
  constructor() {
    super('shopping', { name: 'Shopping', emoji: '🛒', description: 'Coming soon' });
  }
  async showMenu(ctx) {
    return this.showComingSoon(ctx, 'Groceries, electronics & fashion — shop and pay from your wallet.');
  }
  async handle(ctx) {
    if (this.isHome(ctx.text) || this.isHome(ctx.choice)) return this.goHome(ctx.phone);
    return this.showMenu(ctx);
  }
}

module.exports = ShoppingService;
