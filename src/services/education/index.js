const BaseService = require('../BaseService');

class EducationService extends BaseService {
  constructor() {
    super('education', { name: 'Education', emoji: '📚', description: 'Coming soon' });
  }
  async showMenu(ctx) {
    return this.showComingSoon(ctx, 'WAEC/JAMB tutor, school fees & exam results — use *AI Assistant* for homework help now.');
  }
  async handle(ctx) {
    if (this.isHome(ctx.text) || this.isHome(ctx.choice)) return this.goHome(ctx.phone);
    return this.showMenu(ctx);
  }
}

module.exports = EducationService;
