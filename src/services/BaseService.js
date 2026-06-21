/**
 * Base class for all Mysogi super-app services.
 */

const whatsapp = require('../whatsapp');
const { setSession } = require('../sessionStore');
const logger = require('../core/logger');

class BaseService {
  constructor(id, meta = {}) {
    this.id = id;
    this.name = meta.name || id;
    this.emoji = meta.emoji || '•';
    this.description = meta.description || '';
    this.requiresAuth = meta.requiresAuth || false;
    this.STEPS = { MENU: 'menu', ...meta.steps };
  }

  async reply(to, text) {
    await whatsapp.sendText(to, text);
  }

  async buttons(to, body, buttons) {
    await whatsapp.sendButtons(to, body, buttons);
  }

  async list(to, body, buttonLabel, sections) {
    await whatsapp.sendList(to, body, buttonLabel, sections);
  }

  async updateSession(phone, patch) {
    const { getSession } = require('../sessionStore');
    const current = getSession(phone) || { step: 'idle', data: {} };
    setSession(phone, {
      ...current,
      activeService: this.id,
      ...patch,
      data: { ...current.data, ...(patch.data || {}) },
    });
  }

  async goHome(phone) {
    const { showSuperAppMenu } = require('../router/superAppMenu');
    await showSuperAppMenu(phone);
  }

  isCancel(text) {
    const t = (text || '').trim().toLowerCase();
    return ['cancel', 'stop', 'quit', 'exit', 'back'].includes(t);
  }

  isHome(text) {
    const t = (text || '').trim().toLowerCase();
    return ['menu', 'home', '0', 'start'].includes(t) || /^(hi|hello|hey)[\s,!?.]*$/.test(t);
  }

  formatNaira(amount) {
    return `₦${Number(amount || 0).toLocaleString('en-NG')}`;
  }

  log(action, phone, meta = {}) {
    logger.info(`[${this.id}] ${action}`, { phone, ...meta });
  }

  async ensureAuth(ctx) {
    const { isAuthenticated } = require('../userStore');
    if (!isAuthenticated(ctx.phone)) {
      const { promptLoginRequired } = require('../router/authHandler');
      await promptLoginRequired(ctx.phone);
      return false;
    }
    return true;
  }

  async showComingSoon(ctx, blurb = '') {
    if (!(await this.ensureAuth(ctx))) return;
    await this.reply(
      ctx.phone,
      `*${this.emoji} ${this.name}*\n\n` +
        `*Coming soon!* 🚀\n\n` +
        (blurb || `We're putting the finishing touches on ${this.name}.`) +
        `\n\n_Available now: Wallet, Airtime, Bills, AI Assistant, Ads Studio & Partner Services._\n\n` +
        `Type *menu* to go back.`
    );
    await this.goHome(ctx.phone);
  }

  /** Override in subclass */
  async showMenu(ctx) {
    if (!(await this.ensureAuth(ctx))) return;
    return this.showComingSoon(ctx);
  }

  /** Override in subclass */
  async handle(ctx) {
    if (this.isHome(ctx.text) || this.isHome(ctx.choice)) {
      return this.goHome(ctx.phone);
    }
    if (this.isCancel(ctx.text)) {
      await this.reply(ctx.phone, 'Cancelled. Type *menu* for home.');
      return this.goHome(ctx.phone);
    }
    if (!(await this.ensureAuth(ctx))) return;
    return this.showMenu(ctx);
  }

  menuRow() {
    const svc = require('../router/serviceRegistry').SERVICES.find((s) => s.id === this.id);
    const desc = svc?.live === false
      ? 'Coming soon'
      : this.description.slice(0, 72);
    return {
      id: `svc_${this.id}`,
      title: `${this.emoji} ${this.name}`.slice(0, 24),
      description: desc,
    };
  }
}

module.exports = BaseService;
