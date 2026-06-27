/**
 * Super App message router — central orchestrator.
 */

const { getSession, setSession, loadSessionFromDb } = require('../sessionStore');
const { getUser, isAuthenticated } = require('../userStore');
const { createContext } = require('../core/context');
const logger = require('../core/logger');
const config = require('../config');
const { showSuperAppMenu, showMoreServicesMenu, isSuperMenuStep } = require('./superAppMenu');
const { resolveServiceId, getService } = require('./serviceRegistry');
const { tryNaturalLanguageRoute } = require('./nlExecutor');
const {
  handleAuthAction,
  handleAuthSteps,
  promptLoginRequired,
  requiresAuth,
  AUTH_STEPS,
  restoreUserByPhone,
} = require('./authHandler');
const { handleIncomingMessage: handleAdsFlow } = require('../flows/campaignFlow');
const supabaseFlow = require('../flows/supabaseAuthFlow');
const { isSupabaseReady } = require('../auth/supabaseAuth');
const { handleCreditAction, handleCreditCommand, isCreditChoice } = require('../credit/creditHandler');
const pinPortal = require('../security/pinPortal');
const { normalizePhone } = require('../utils/phone');

const GREETINGS = new Set([
  'menu', 'start', 'hi', 'hello', 'help', '0', 'home', 'hey', 'hiya', 'howdy',
  'good morning', 'good afternoon', 'good evening', 'morning', 'afternoon', 'evening',
  'login', 'signup', 'sign up', 'log in', 'register',
]);

function isGreeting(text) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return false;
  if (GREETINGS.has(t)) return true;
  if (/^good\s+(morning|afternoon|evening)$/i.test(t)) return true;
  return /^(hi|hello|hey)[\s,!?.]*$/i.test(t);
}

async function showEntry(phone) {
  if (isAuthenticated(phone)) {
    return showSuperAppMenu(phone);
  }
  const next = await supabaseFlow.showAuthWelcome(phone);
  setSession(phone, { step: next.step, activeService: null, data: next.data });
}

async function routeToService(phone, serviceId, ctx) {
  if (requiresAuth(phone)) {
    return promptLoginRequired(phone);
  }

  const service = getService(serviceId);
  if (!service) {
    await showSuperAppMenu(phone);
    return;
  }

  const session = getSession(phone) || { step: 'idle', data: {} };
  setSession(phone, {
    ...session,
    activeService: serviceId,
    step: `${serviceId}_menu`,
    data: session.data,
  });

  const freshCtx = createContext(
    phone,
    ctx.incoming ? { type: 'text', text: { body: ctx.text } } : {},
    getSession(phone),
    getUser(phone)
  );
  await service.showMenu(freshCtx);
}

async function handleIncomingMessage(from, message) {
  const phone = normalizePhone(from);
  const incoming = {
    text: message.text?.body || message.button?.text || '',
    buttonId: message.interactive?.button_reply?.id || '',
    listId: message.interactive?.list_reply?.id || '',
    media: ['image', 'document', 'video', 'audio'].includes(message.type) ? message : null,
    type: message.type,
    id: message.id,
  };

  if (!incoming.text && !incoming.buttonId && !incoming.listId && !incoming.media) {
    const whatsapp = require('../whatsapp');
    await whatsapp.sendText(
      phone,
      'I received your message but cannot process this format yet.\n\nType *menu* or *hi*, or send text like *buy MTN airtime 500*.'
    );
    return;
  }

  // Restore session from Supabase (required on Netlify — in-memory cache is lost between cold starts)
  let session = await loadSessionFromDb(phone);
  if (!session) {
    session = { step: 'idle', data: {}, activeService: null };
    setSession(phone, session);
  }

  // Restore user profile from Supabase

  if (isSupabaseReady()) {
    await restoreUserByPhone(phone);
  }

  const user = getUser(phone);
  const ctx = createContext(phone, message, session, user);
  const choice = incoming.buttonId || incoming.listId || incoming.text;
  const textLower = (incoming.text || '').trim().toLowerCase();

  if (choice === 'wallet_pin_set') {
    await pinPortal.promptSetPin(phone);
    return;
  }
  if (choice === 'wallet_pin_change') {
    await pinPortal.promptChangePin(phone);
    return;
  }

  // Quick auth commands
  if (textLower === 'login' || textLower === 'log in') {
    return handleAuthAction(phone, 'auth_login');
  }
  if (textLower === 'logout' || textLower === 'log out') {
    return handleAuthAction(phone, 'auth_logout');
  }
  if (textLower === 'signup' || textLower === 'sign up' || textLower === 'register') {
    return handleAuthAction(phone, 'auth_signup');
  }

  // Auth flow steps
  if (AUTH_STEPS.has(session.step) && session.activeService !== 'ads') {
    const handled = await handleAuthSteps(phone, message, session);
    if (handled) return;
  }

  // Auth menu actions
  if (['auth_login', 'auth_signup', 'auth_logout', 'auth_profile'].includes(choice)) {
    const handled = await handleAuthAction(phone, choice);
    if (handled) return;
  }

  if (choice === 'svc_more_menu' && isSuperMenuStep(session)) {
    return showMoreServicesMenu(phone);
  }

  if (choice === 'svc_main_menu') {
    return showSuperAppMenu(phone);
  }

  // Mysogi Credit — global actions
  if (isCreditChoice(choice)) {
    const handled = await handleCreditAction(phone, choice, session);
    if (handled) return;
  }

  if (await handleCreditCommand(phone, incoming.text)) return;

  // Natural language — understand free text before greeting/menu shortcuts
  if (incoming.text) {
    const nlCtx = { ...ctx, session, text: incoming.text, incoming };
    const nlHandled = await tryNaturalLanguageRoute(phone, incoming, nlCtx);
    if (nlHandled) return;
  }

  // Greeting → auth welcome if not logged in, else super menu
  if (isGreeting(incoming.text) && !session.activeService) {
    return showEntry(phone);
  }

  // Block unauthenticated access to services
  if (requiresAuth(phone) && session.activeService && session.activeService !== 'ads') {
    return promptLoginRequired(phone);
  }

  // Ads Studio — legacy flow
  if (session.activeService === 'ads') {
    return handleAdsFlow(phone, message);
  }

  // Active service handler
  if (session.activeService) {
    const service = getService(session.activeService);
    if (service) {
      try {
        await service.handle(ctx);
      } catch (err) {
        logger.error('Service handler error', { service: session.activeService, error: err.message });
        await service.reply(phone, 'Something went wrong. Type *menu* to go home.');
      }
      return;
    }
  }

  // Wallet quick access
  if (
    (choice === 'wallet_topup' || choice === 'wallet_topup_self' || choice === 'wallet_topup_other' ||
      textLower === 'wallet' || textLower === 'topup' || textLower === 'top up') &&
    isAuthenticated(phone)
  ) {
    setSession(phone, { ...session, activeService: 'wallet', step: 'wallet_menu' });
    const walletSvc = getService('wallet');
    if (choice === 'wallet_topup_self') {
      await walletSvc.reply(phone, 'How much do you want to add to *your* wallet? (min ₦100)');
      await walletSvc.updateSession(phone, {
        step: walletSvc.STEPS.TOPUP_AMOUNT,
        data: { topupType: 'self', beneficiaryPhone: phone },
      });
      return;
    }
    if (choice === 'wallet_topup_other') {
      await walletSvc.reply(phone, '🎁 Enter recipient *WhatsApp number*:\n\n_e.g. 08012345678_');
      await walletSvc.updateSession(phone, { step: walletSvc.STEPS.TOPUP_OTHER_PHONE, data: { topupType: 'gift' } });
      return;
    }
    if (choice === 'wallet_topup' || textLower === 'topup' || textLower === 'top up') {
      return walletSvc.showTopUpChoice({ phone, step: 'wallet_menu', data: {}, incoming: ctx.incoming });
    }
    return walletSvc.showMenu(ctx);
  }

  // Service selection from menu — requires auth
  const serviceId = resolveServiceId(choice);
  if (serviceId && isSuperMenuStep(session)) {
    if (requiresAuth(phone)) {
      return promptLoginRequired(phone);
    }
    if (serviceId === 'ads') {
      setSession(phone, { ...session, activeService: 'ads', step: 'auth_gate' });
      const { showEntryForNewUser } = require('../flows/campaignFlow');
      return showEntryForNewUser(phone);
    }
    // Partner service picked directly from main menu
    if (serviceId === 'partners' && choice?.startsWith('partner_') && !['partner_add', 'partner_mine'].includes(choice)) {
      setSession(phone, { ...session, activeService: 'partners', step: 'partners_menu' });
      return getService('partners').handle(ctx);
    }
    return routeToService(phone, serviceId, ctx);
  }

  // Default entry
  if (isSuperMenuStep(session) || session.step === 'idle') {
    return showEntry(phone);
  }

  return showEntry(phone);
}

module.exports = { handleIncomingMessage, routeToService, isGreeting, showEntry };
