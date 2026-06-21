const BaseService = require('../BaseService');

class HealthcareService extends BaseService {
  constructor() {
    super('healthcare', { name: 'Healthcare', emoji: '🏥', description: 'Coming soon' });
  }
  async showMenu(ctx) {
    return this.showComingSoon(ctx, 'Doctor consultations, pharmacy delivery & lab test booking.');
  }
  async handle(ctx) {
    if (this.isHome(ctx.text) || this.isHome(ctx.choice)) return this.goHome(ctx.phone);
    return this.showMenu(ctx);
  }
}

module.exports = HealthcareService;
