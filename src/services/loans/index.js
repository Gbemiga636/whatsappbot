const BaseService = require('../BaseService');
const credit = require('../../credit/creditService');
const creditScoring = require('../../credit/creditScoring');
const wallet = require('../../wallet/walletService');
const config = require('../../config');

class LoansService extends BaseService {
  constructor() {
    super('loans', {
      name: 'Mysogi Credit',
      emoji: '⚡',
      description: 'Instant credit & BNPL',
      steps: {
        MENU: 'menu',
        ACTIVATE: 'activate',
      },
    });
  }

  async showMenu(ctx) {
    if (!(await this.ensureAuth(ctx))) return;

    const profile = await creditScoring.getProfile(ctx.phone);
    const activated = profile.activated;
    const dueDays = config.credit.repaymentDays || 7;

    let body =
      `*⚡ Mysogi Credit*\n` +
      `_Instant credit in chat — beat the telco middlemen._\n\n` +
      `Score: *${profile.score}* · Tier: *${profile.tier}*\n` +
      `Limit: ${wallet.formatNaira(profile.credit_limit)}\n` +
      `Available: *${wallet.formatNaira(profile.available)}*\n` +
      `Outstanding: ${wallet.formatNaira(profile.outstanding)}\n\n` +
      `Use credit for airtime, data & bills when your wallet is low.\n` +
      `Repays in ${dueDays} days — auto-deducts on wallet top-up.`;

    const rows = [];
    if (!activated) {
      rows.push({ id: 'credit_activate', title: '✨ Activate credit', description: 'Unlock instant BNPL' });
    } else {
      rows.push({ id: 'credit_refresh_score', title: '📊 Refresh score', description: `Current: ${profile.score}` });
    }
    if (profile.outstanding > 0) {
      rows.push({ id: 'credit_repay', title: '💰 Repay now', description: wallet.formatNaira(profile.outstanding) });
    }
    rows.push({ id: 'svc_airtime', title: '📱 Buy airtime', description: 'Pay with credit' });
    rows.push({ id: 'svc_bills', title: '⚡ Pay bills', description: 'Pay with credit' });
    rows.push({ id: 'credit_how', title: '❓ How it works', description: 'Mysogi vs telco loans' });

    await this.list(ctx.phone, body, 'Credit menu', [{ title: 'Mysogi Credit', rows: rows.slice(0, 10) }]);
    await this.updateSession(ctx.phone, { step: this.STEPS.MENU });
  }

  async handle(ctx) {
    if (this.isHome(ctx.text)) return this.goHome(ctx.phone);
    if (this.isCancel(ctx.text)) {
      await this.reply(ctx.phone, 'Cancelled.');
      return this.goHome(ctx.phone);
    }

    const { choice } = ctx;

    if (choice === 'credit_activate') {
      const result = await credit.activateCreditLine(ctx.phone);
      await this.reply(ctx.phone, result.message);
      return this.showMenu(ctx);
    }

    if (choice === 'credit_refresh_score') {
      const scored = await creditScoring.scoreUser(ctx.phone);
      await this.reply(
        ctx.phone,
        `📊 *Score updated*\n\nScore: *${scored.score}*\nTier: *${scored.tier}*\nLimit: ${wallet.formatNaira(scored.limit)}`
      );
      return this.showMenu(ctx);
    }

    if (choice === 'credit_repay') {
      const { handleCreditAction } = require('../../credit/creditHandler');
      await handleCreditAction(ctx.phone, 'credit_repay', ctx.session || {});
      return this.showMenu(ctx);
    }

    if (choice === 'credit_how') {
      await this.reply(
        ctx.phone,
        `*How Mysogi Credit works*\n\n` +
          `Unlike telco airtime loans (powered by backends like Optasia), Mysogi gives you credit *directly in WhatsApp*.\n\n` +
          `✅ No USSD · No app install\n` +
          `✅ Airtime, data & bills\n` +
          `✅ Score built from *your* wallet & chat activity\n` +
          `✅ Auto-repay when you top up\n\n` +
          `Build your score: top up wallet, buy services, repay on time.`
      );
      return this.showMenu(ctx);
    }

    if (choice === 'svc_airtime' || choice === 'svc_bills') {
      const { routeToService } = require('../../router/superAppRouter');
      const serviceId = choice.replace('svc_', '');
      return routeToService(ctx.phone, serviceId, ctx);
    }

    return this.showMenu(ctx);
  }
}

module.exports = LoansService;
