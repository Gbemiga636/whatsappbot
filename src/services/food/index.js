const BaseService = require('../BaseService');

class FoodService extends BaseService {
  constructor() {
    super('food', { name: 'Food Delivery', emoji: '🍔', description: 'Coming soon' });
  }
  async showMenu(ctx) {
    return this.showComingSoon(ctx, 'Order from restaurants near you — delivery, menus & wallet payment.');
  }
  async handle(ctx) {
    if (this.isHome(ctx.text) || this.isHome(ctx.choice)) return this.goHome(ctx.phone);
    return this.showMenu(ctx);
  }
}

module.exports = FoodService;
