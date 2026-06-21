const BaseService = require('../BaseService');

class AgricultureService extends BaseService {
  constructor() {
    super('agriculture', { name: 'Agriculture', emoji: '🌾', description: 'Coming soon' });
  }
  async showMenu(ctx) {
    return this.showComingSoon(ctx, 'Farm marketplace, crop advisory, weather & agricultural loans.');
  }
  async handle(ctx) {
    if (this.isHome(ctx.text) || this.isHome(ctx.choice)) return this.goHome(ctx.phone);
    return this.showMenu(ctx);
  }
}

module.exports = AgricultureService;
