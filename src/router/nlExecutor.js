/**
 * Execute parsed natural-language intents across the super app.
 */

const whatsapp = require('../whatsapp');
const config = require('../config');
const logger = require('../core/logger');
const { getService } = require('./serviceRegistry');
const { LIVE_SERVICES } = require('./intentRouter');
const { showSuperAppMenu } = require('./superAppMenu');
const { handleAuthAction } = require('./authHandler');
const pinPortal = require('../security/pinPortal');
const wallet = require('../wallet/walletService');
const telecom = require('../providers/telecomProvider');
const ai = require('../providers/openai');
const { setSession, getSession } = require('../sessionStore');
const { createContext } = require('../core/context');
const { getUser } = require('../userStore');
const { isAffirmation, isDenial, isOrderPhrase, isPurchaseIntent } = require('./nlOrderParser');
const {
  createTelecomDraft,
  createBillDraft,
  mergeDraft,
  getMissingFields,
  promptForField,
  isNewOrderOverride,
  draftToAirtime,
  draftToBill,
  NETWORKS,
} = require('./nlOrderDraft');

const NL_GATHER_STEP = 'nl_gather';

function toLocalPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('234')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0')) return digits;
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

async function replyHelp(phone) {
  await whatsapp.sendText(
    phone,
    `*Just say what you need* 🌍\n\n` +
      `_No menu required — type an order directly:_\n\n` +
      `• "Get me airtime"\n` +
      `• "Buy MTN airtime 500"\n` +
      `• "I want airtime 100" → bot asks only for network\n` +
      `• "Send 1000 Glo airtime to 08012345678"\n` +
      `• "Top up my MTN line with 500"\n` +
      `• "Buy 2GB MTN data"\n` +
      `• "Pay DSTV bill 5000"\n` +
      `• "Top up wallet 2000"\n` +
      `• "What's my balance"\n\n` +
      `At confirm, say *"yes"* or *"pay"* to complete.\n` +
      `Type *menu* anytime for the button menu.`
  );
}

async function handleAiChat(phone, text, session) {
  await whatsapp.sendText(phone, '⏳ One moment…');
  const data = session.data || {};
  const response = await ai.chat({
    messages: [
      {
        role: 'system',
        content:
          'You are Mysogi, Africa\'s WhatsApp super-app assistant for Nigerians. ' +
          'Users can ORDER by saying things like "buy MTN airtime 500" or "pay DSTV 5000". ' +
          'If they want to order, tell them the exact phrase to use. Be concise. WhatsApp formatting only.',
      },
      ...(data.nlHistory || []).slice(-4),
      { role: 'user', content: text },
    ],
  });

  const history = [...(data.nlHistory || []), { role: 'user', content: text }, { role: 'assistant', content: response.text }];
  setSession(phone, {
    ...session,
    step: 'super_menu',
    activeService: null,
    data: { ...data, nlHistory: history.slice(-8) },
  });

  await whatsapp.sendText(phone, response.text);
  return true;
}

async function routeToServiceLazy(phone, serviceId, ctx) {
  const { routeToService } = require('./superAppRouter');
  return routeToService(phone, serviceId, ctx || { phone, session: getSession(phone), incoming: {} });
}

async function showAirtimeConfirm(phone, airtime) {
  const svc = getService('airtime');
  const pricing = wallet.formatWalletSummary(airtime.amount);
  const { credit } = require('../wallet/purchaseHelper');
  const buttons = [
    { id: 'air_confirm', title: 'Pay from wallet' },
    { id: 'air_cancel', title: 'Cancel' },
  ];
  const eligibility = await credit.checkEligibility(phone, airtime.amount);
  if (eligibility.ok) buttons.splice(1, 0, { id: 'air_credit', title: '⚡ Pay with credit' });

  await svc.buttons(
    phone,
    `*Confirm order*\n\n${airtime.type === 'data' ? 'Plan' : 'Amount'}: ${airtime.resolvedPlan?.planName || airtime.value || airtime.amount}\n` +
      `Network: ${airtime.network}\nPhone: ${airtime.phone}\n\n${pricing.text}\n\n` +
      `_Say *yes* or tap Pay to complete._`,
    buttons.slice(0, 3)
  );
  setSession(phone, { activeService: 'airtime', step: 'confirm', data: { airtime, nlDraft: null } });
}

async function continueFromDraft(phone, draft, session = {}) {
  const missing = getMissingFields(draft);

  if (missing.length === 0) {
    if (draft.action === 'buy_airtime' || draft.action === 'buy_data') {
      return completeTelecomDraft(phone, draft);
    }
    if (draft.action === 'pay_bill') {
      return completeBillDraft(phone, draft);
    }
  }

  const field = missing[0];
  await whatsapp.sendText(phone, promptForField(draft, field));

  setSession(phone, {
    activeService: draft.service,
    step: NL_GATHER_STEP,
    data: {
      ...(session.data?.nlHistory ? { nlHistory: session.data.nlHistory } : {}),
      nlDraft: draft,
    },
  });
  return true;
}

async function completeTelecomDraft(phone, draft) {
  const airtime = draftToAirtime(draft);

  if (!airtime.network || !NETWORKS.includes(airtime.network)) {
    return continueFromDraft(phone, draft);
  }

  if (airtime.type === 'data') {
    const plan = airtime.plan || airtime.value;
    if (!plan) return continueFromDraft(phone, draft);
    airtime.value = plan;
    const resolved = await telecom.resolveDataPlan(airtime.network, plan);
    if (!resolved.ok) {
      await whatsapp.sendText(phone, resolved.message);
      return continueFromDraft(phone, draft);
    }
    airtime.resolvedPlan = resolved;
    airtime.amount = resolved.amount;
  } else {
    if (!airtime.amount || airtime.amount < 50) {
      await whatsapp.sendText(phone, 'Minimum airtime is *₦50*. Enter a higher amount.');
      const nextDraft = { ...draft, params: { ...draft.params, amount: null } };
      return continueFromDraft(phone, nextDraft);
    }
    airtime.phone = airtime.phone || toLocalPhone(phone);
    airtime.value = String(airtime.amount);
  }

  if (airtime.recipientType === 'other' && !airtime.phone) {
    return continueFromDraft(phone, draft);
  }

  airtime.phone = airtime.phone || toLocalPhone(phone);
  await showAirtimeConfirm(phone, airtime);
  return true;
}

async function completeBillDraft(phone, draft) {
  const bill = draftToBill(draft);
  if (!bill.amount || bill.amount < 100) {
    await whatsapp.sendText(phone, 'Minimum bill payment is *₦100*.');
    const nextDraft = { ...draft, params: { ...draft.params, amount: null } };
    return continueFromDraft(phone, nextDraft);
  }
  await showBillConfirm(phone, bill);
  return true;
}

async function tryContinueDraft(phone, text, session) {
  const draft = session.data?.nlDraft;
  if (!draft || session.step !== NL_GATHER_STEP) return false;

  if (isDenial(text)) {
    await whatsapp.sendText(phone, 'Order cancelled.');
    setSession(phone, {
      step: 'super_menu',
      activeService: null,
      data: { ...(session.data?.nlHistory ? { nlHistory: session.data.nlHistory } : {}) },
    });
    await showSuperAppMenu(phone);
    return true;
  }

  if (isNewOrderOverride(text, draft)) return false;

  const merged = mergeDraft(draft, text, phone);
  return continueFromDraft(phone, merged, session);
}

async function startAirtimeFromIntent(phone, params, type = 'airtime', ctx) {
  const session = getSession(phone) || { step: 'idle', data: {} };
  const existing = session.data?.nlDraft;
  const action = type === 'data' ? 'buy_data' : 'buy_airtime';

  let mergedParams = { ...params, type };
  if (existing?.action === action) {
    mergedParams = { ...existing.params, ...mergedParams };
  }

  const draft = createTelecomDraft(type, mergedParams, phone);
  return continueFromDraft(phone, draft, session);
}

async function showBillConfirm(phone, bill) {
  const svc = getService('bills');
  const pricing = wallet.formatWalletSummary(bill.amount);
  const { credit } = require('../wallet/purchaseHelper');
  const buttons = [
    { id: 'bill_confirm', title: 'Pay from wallet' },
    { id: 'bill_cancel', title: 'Cancel' },
  ];
  const eligibility = await credit.checkEligibility(phone, bill.amount);
  if (eligibility.ok) buttons.splice(1, 0, { id: 'bill_credit', title: '⚡ Pay with credit' });

  const detail =
    bill.type === 'electricity'
      ? `Meter: ${bill.meter}\nProvider: ${bill.provider}`
      : `Smartcard: ${bill.smartcard}`;

  await svc.buttons(
    phone,
    `*Confirm bill payment*\n\nType: ${bill.type}\n${detail}\nAmount: ${wallet.formatNaira(bill.amount)}\n\n${pricing.text}\n\n_Say *yes* or tap Pay to complete._`,
    buttons.slice(0, 3)
  );
  setSession(phone, { activeService: 'bills', step: 'confirm', data: { bill, nlDraft: null } });
}

async function startBillFromIntent(phone, params, ctx) {
  const session = getSession(phone) || { step: 'idle', data: {} };
  const existing = session.data?.nlDraft;

  let mergedParams = { ...params };
  if (existing?.action === 'pay_bill') {
    mergedParams = { ...existing.params, ...mergedParams };
  }

  const draft = createBillDraft(mergedParams);
  return continueFromDraft(phone, draft, session);
}

async function tryConfirmFromText(phone, text, session) {
  if (session.step !== 'confirm' || !session.activeService) return false;

  if (isDenial(text)) {
    await whatsapp.sendText(phone, 'Order cancelled.');
    await showSuperAppMenu(phone);
    return true;
  }

  if (!isAffirmation(text)) return false;

  const choiceByService = {
    airtime: 'air_confirm',
    bills: 'bill_confirm',
  };
  const choice = choiceByService[session.activeService];
  if (!choice) return false;

  const service = getService(session.activeService);
  if (!service) return false;

  const message = {
    type: 'interactive',
    interactive: { button_reply: { id: choice } },
    text: { body: text },
  };
  const ctx = createContext(phone, message, session, getUser(phone));
  await service.handle(ctx);
  return true;
}

async function executeNaturalLanguage(phone, intent, ctx) {
  if (!intent) return false;

  const { action, params = {} } = intent;
  let { service } = intent;
  const session = getSession(phone) || { step: 'idle', data: {} };

  logger.info('NL intent executing', { phone, service, action, params, confidence: intent.confidence });

  // Keep nlHistory; do not wipe in-progress draft unless starting a fresh purchase below
  if (isPurchaseIntent(intent) && !session.data?.nlDraft) {
    setSession(phone, {
      step: 'idle',
      activeService: null,
      data: { ...(session.data?.nlHistory ? { nlHistory: session.data.nlHistory } : {}) },
    });
  }

  if (action === 'menu') {
    await showSuperAppMenu(phone);
    return true;
  }

  if (action === 'help') {
    await replyHelp(phone);
    return true;
  }

  if (action === 'logout') return !!(await handleAuthAction(phone, 'auth_logout'));
  if (action === 'login') return !!(await handleAuthAction(phone, 'auth_login'));
  if (action === 'signup') return !!(await handleAuthAction(phone, 'auth_signup'));

  if (action === 'chat' || (!service && action === 'open')) {
    return handleAiChat(phone, ctx.text || '', session);
  }

  if (action === 'balance' || (service === 'wallet' && action === 'balance')) {
    const balance = await wallet.getBalance(phone);
    await whatsapp.sendText(phone, `💳 *Your wallet balance:* ${wallet.formatNaira(balance)}`);
    await showSuperAppMenu(phone);
    return true;
  }

  if (action === 'set_pin') {
    await pinPortal.promptSetPin(phone);
    return true;
  }

  if (action === 'change_pin') {
    await pinPortal.promptChangePin(phone);
    return true;
  }

  if (action === 'topup' || (service === 'wallet' && /topup/i.test(action))) {
    const amount = Number(params.amount);
    const walletSvc = getService('wallet');
    if (amount >= 100) {
      await walletSvc.processTopUp(phone, amount, { topupType: 'self', beneficiaryPhone: phone });
      return true;
    }
    setSession(phone, { ...session, activeService: 'wallet', step: 'wallet_menu' });
    await walletSvc.showTopUpChoice({ phone, step: 'wallet_menu', data: {}, incoming: {} });
    return true;
  }

  if (action === 'buy_airtime') {
    return startAirtimeFromIntent(phone, params, 'airtime', ctx);
  }

  if (action === 'buy_data') {
    return startAirtimeFromIntent(phone, params, 'data', ctx);
  }

  if (action === 'pay_bill') {
    return startBillFromIntent(phone, params, ctx);
  }

  if (action === 'activate_credit') {
    const { handleCreditAction } = require('../credit/creditHandler');
    return handleCreditAction(phone, 'credit_activate', session);
  }

  if (action === 'credit' || service === 'loans') {
    service = 'loans';
  }

  if (!service) return false;

  if (!LIVE_SERVICES.includes(service)) {
    const svc = getService(service);
    if (svc) {
      await svc.showComingSoon(createContext(phone, {}, session, getUser(phone)));
      return true;
    }
  }

  if (service === 'ads') {
    setSession(phone, { ...session, activeService: 'ads', step: 'auth_gate' });
    const { showEntryForNewUser } = require('../flows/campaignFlow');
    await showEntryForNewUser(phone);
    return true;
  }

  return routeToServiceLazy(phone, service, ctx);
}

function shouldTryNaturalLanguage(session, incoming) {
  if (!config.features.naturalLanguage) return false;
  if (!incoming.text || incoming.buttonId || incoming.listId) return false;

  const text = incoming.text.trim();
  if (text.length < 2) return false;

  if (/^(menu|home|start|hi|hello|hey|help|0)$/i.test(text)) return false;

  if (session.step === NL_GATHER_STEP || session.data?.nlDraft) return true;

  if (session.step === 'confirm' && (isAffirmation(text) || isDenial(text))) return true;

  if (isOrderPhrase(text)) {
    if (session.activeService && session.step !== NL_GATHER_STEP && /^[₦]?\d+([.,]\d+)?$/.test(text)) {
      return false;
    }
    return true;
  }

  if (session.activeService && session.step !== NL_GATHER_STEP && /^[₦]?\d+([.,]\d+)?$/.test(text)) {
    return false;
  }

  if (!session.activeService || session.step === 'super_menu' || session.step === 'idle') return true;

  if (/[a-zA-Z]{3,}/.test(text) && text.length >= 4) return true;

  return false;
}

async function tryNaturalLanguageRoute(phone, incoming, ctx) {
  const session = ctx.session || getSession(phone);
  if (!shouldTryNaturalLanguage(session, incoming)) return false;

  const { requiresAuth, promptLoginRequired } = require('./authHandler');

  if (await tryConfirmFromText(phone, incoming.text, session)) return true;

  if (await tryContinueDraft(phone, incoming.text, session)) return true;

  const { parseNaturalLanguage } = require('./intentRouter');
  const intent = await parseNaturalLanguage(incoming.text);
  if (!intent) return false;

  const publicActions = new Set(['menu', 'help', 'login', 'signup', 'chat']);
  if (requiresAuth(phone) && !publicActions.has(intent.action)) {
    await promptLoginRequired(phone);
    return true;
  }

  if (intent.confidence === 'low' && !intent.service) {
    if (!isOrderPhrase(incoming.text)) return false;
  }

  if (intent.confidence === 'low' && intent.action === 'chat' && intent.service) {
    intent.action = 'open';
  }

  if (intent.confidence === 'low' && isOrderPhrase(incoming.text) && intent.action === 'open') {
    const { resolveTelecomAction } = require('./nlOrderParser');
    const telecomAction = resolveTelecomAction(incoming.text, intent.params || {}, intent.action);
    if (telecomAction) intent.action = telecomAction;
  }

  return executeNaturalLanguage(phone, intent, ctx);
}

module.exports = {
  executeNaturalLanguage,
  shouldTryNaturalLanguage,
  tryNaturalLanguageRoute,
};
