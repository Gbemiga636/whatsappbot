const BaseService = require('../BaseService');

class TravelService extends BaseService {
  constructor() {
    super('travel', { name: 'Travel', emoji: '✈️', description: 'Coming soon' });
  }
  async showMenu(ctx) {
    return this.showComingSoon(ctx, 'Flights, hotels, ride-hailing & visa assistance.');
  }
  async handle(ctx) {
    if (this.isHome(ctx.text) || this.isHome(ctx.choice)) return this.goHome(ctx.phone);
    return this.showMenu(ctx);
  }
}

module.exports = TravelService;
