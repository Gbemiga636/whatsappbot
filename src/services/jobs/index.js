const BaseService = require('../BaseService');

class JobsService extends BaseService {
  constructor() {
    super('jobs', { name: 'Jobs', emoji: '💼', description: 'Coming soon' });
  }
  async showMenu(ctx) {
    return this.showComingSoon(ctx, 'Job search, remote roles & apply directly from WhatsApp.');
  }
  async handle(ctx) {
    if (this.isHome(ctx.text) || this.isHome(ctx.choice)) return this.goHome(ctx.phone);
    return this.showMenu(ctx);
  }
}

module.exports = JobsService;
