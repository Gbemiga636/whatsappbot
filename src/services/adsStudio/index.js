const BaseService = require('../BaseService');

/** Ads Studio — delegates to legacy campaign flow */
class AdsStudioService extends BaseService {
  constructor() {
    super('ads', { name: 'Ads Studio', emoji: '🎯', description: 'AI ads & campaigns' });
  }

  async showMenu(ctx) {
    const { showEntryForNewUser } = require('../../flows/campaignFlow');
    const { setSession } = require('../../sessionStore');
    setSession(ctx.phone, { step: 'auth_gate', activeService: 'ads', data: {} });
    await showEntryForNewUser(ctx.phone);
  }

  async handle(ctx) {
    // Handled by campaignFlow via superAppRouter
    return this.showMenu(ctx);
  }
}

module.exports = AdsStudioService;
