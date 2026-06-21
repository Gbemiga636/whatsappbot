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
const { isAffirmation, isDenial, isOrderPhrase, isPurchaseIntent, normalizeNetwork } = require('./nlOrderParser');

const NETWORKS = ['MTN', 'GLO', 'Airtel', '9mobile'];

function resolveNetwork(raw) {
  return normalizeNetwork(raw);
}

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
  setSession(phone, { activeService: 'airtime', step: 'confirm', data: { airtime } });
}

async function startAirtimeFromIntent(phone, params, type = 'airtime', ctx) {
  const network = resolveNetwork(params.network);
  let amount = params.amount ? Number(params.amount) : null;
  const recipient = params.recipient === 'other' ? 'other' : 'self';
  let targetPhone =
    recipient === 'self' ? toLocalPhone(phone) : params.phone ? toLocalPhone(params.phone) : null;

  if (!network || !NETWORKS.includes(network)) {
    const svc = getService('airtime');
    const label = type === 'data' ? 'data' : 'airtime';
    await svc.list(phone, `*Buy ${label}*\n\nSelect network:`, 'Network', [{
      title: 'Networks',
      rows: NETWORKS.map((n) => ({
        id: `net_${n.toLowerCase()}`,
        title: n,
        description: type === 'data' ? 'Data bundle' : 'Airtime',
      })),
    }]);
    setSession(phone, {
      activeService: 'airtime',
      step: 'pick_network',
      data: { airtime: { type, recipientType: recipient, phone: targetPhone || undefined } },
    });
    return true;
  }

  const airtime = { type, network, recipientType: recipient };

  if (recipient === 'other' && !targetPhone) {
    setSession(phone, { activeService: 'airtime', step: 'enter_phone', data: { airtime } });
    await whatsapp.sendText(phone, `*${network} ${type}*\n\nEnter recipient phone:\n\n_e.g. 08012345678_`);
    return true;
  }

  airtime.phone = targetPhone;

  if (type === 'data') {
    const plan = params.plan || params.value;
    if (!plan) {
      setSession(phone, { activeService: 'airtime', step: 'enter_amount', data: { airtime } });
      await whatsapp.sendText(phone, `*${network} data* for ${targetPhone}.\n\nEnter plan (e.g. 1GB, 2GB):`);
      return true;
    }
    airtime.value = plan;
    const resolved = await telecom.resolveDataPlan(network, plan);
    if (!resolved.ok) {
      await whatsapp.sendText(phone, resolved.message);
      return true;
    }
    airtime.resolvedPlan = resolved;
    airtime.amount = resolved.amount;
    await showAirtimeConfirm(phone, airtime);
    return true;
  }

  if (!amount || amount < 50) {
    setSession(phone, { activeService: 'airtime', step: 'enter_amount', data: { airtime } });
    await whatsapp.sendText(phone, `*${network} airtime* for ${targetPhone}.\n\nEnter amount (e.g. 500):`);
    return true;
  }

  airtime.amount = amount;
  airtime.value = String(amount);
  await showAirtimeConfirm(phone, airtime);
  return true;
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
  setSession(phone, { activeService: 'bills', step: 'confirm', data: { bill } });
}

async function startBillFromIntent(phone, params, ctx) {
  const type = params.bill_type || params.type;
  if (!type) {
    return routeToServiceLazy(phone, 'bills', ctx);
  }

  const bill = { type };

  if (type === 'electricity') {
    if (!params.meter) {
      setSession(phone, { activeService: 'bills', step: 'enter_meter', data: { bill: { type } } });
      await whatsapp.sendText(
        phone,
        '⚡ *Electricity bill*\n\nSend meter number and provider:\n\n_Example: 45012345678, IKEDC_'
      );
      return true;
    }
    bill.meter = params.meter;
    bill.provider = (params.provider || 'IKEDC').toUpperCase();
  } else {
    const card = params.smartcard || params.meter;
    if (!card) {
      setSession(phone, { activeService: 'bills', step: 'enter_meter', data: { bill: { type } } });
      await whatsapp.sendText(phone, `📺 *${type.toUpperCase()}*\n\nEnter your smartcard number:`);
      return true;
    }
    bill.smartcard = card;
  }

  const amount = Number(params.amount);
  if (!amount || amount < 100) {
    setSession(phone, { activeService: 'bills', step: 'enter_amount', data: { bill } });
    await whatsapp.sendText(phone, `Enter amount in Naira for your ${type} bill:`);
    return true;
  }

  bill.amount = amount;
  await showBillConfirm(phone, bill);
  return true;
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

  if (isPurchaseIntent(intent)) {
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

  if (session.step === 'confirm' && (isAffirmation(text) || isDenial(text))) return true;

  if (isOrderPhrase(text)) {
    if (session.activeService && /^[₦]?\d+([.,]\d+)?$/.test(text)) return false;
    return true;
  }

  if (session.activeService && /^[₦]?\d+([.,]\d+)?$/.test(text)) return false;

  if (!session.activeService || session.step === 'super_menu' || session.step === 'idle') return true;

  if (/[a-zA-Z]{3,}/.test(text) && text.length >= 4) return true;

  return false;
}

async function tryNaturalLanguageRoute(phone, incoming, ctx) {
  const session = ctx.session || getSession(phone);
  if (!shouldTryNaturalLanguage(session, incoming)) return false;

  const { requiresAuth, promptLoginRequired } = require('./authHandler');

  if (await tryConfirmFromText(phone, incoming.text, session)) return true;

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
