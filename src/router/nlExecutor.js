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
const { isAffirmation, isDenial, isOrderPhrase, isPurchaseIntent, isBettingRequest, isWalletTopUpRequest, detectAmbiguousIntents, isWizardAnswer, regexOrderIntent } = require('./nlOrderParser');
const {
  buildServicesListText,
  buildChatAssistantPrompt,
  isServicesQuestion,
  isGeneralQuestion,
} = require('./assistantPrompt');
const contactStore = require('../contacts/contactStore');
const {
  createTelecomDraft,
  createBillDraft,
  createBettingDraft,
  mergeDraft,
  getMissingFields,
  promptForField,
  isNewOrderOverride,
  draftToAirtime,
  draftToBill,
  NETWORKS,
} = require('./nlOrderDraft');

const NL_GATHER_STEP = 'nl_gather';
const NL_DISAMBIGUATE_STEP = 'nl_disambiguate';

function isNewPurchaseMessage(text, session) {
  if (isServicesQuestion(text)) return true;
  if (isBettingRequest(text)) return true;
  if (isWalletTopUpRequest(text)) return true;
  if (/^(balance|my balance|wallet balance|check balance)$/i.test(String(text || '').trim())) return true;

  const fresh = regexOrderIntent(text);
  if (fresh && isPurchaseIntent(fresh)) return true;

  if (isNewOrderOverride(text, session?.data?.nlDraft)) return true;

  if (session?.step === NL_GATHER_STEP || session?.data?.nlDraft) return true;

  if (isOrderPhrase(text) && !isWizardAnswer(text)) {
    const params = require('./nlOrderParser').extractOrderParams(text);
    if (
      params.bookmaker ||
      params.bill_type ||
      params.network ||
      params.plan ||
      params.meter ||
      /\b(fund|bet|airtime|data|dstv|electricity|wallet|sporty|sporting)\b/i.test(text)
    ) {
      return true;
    }
  }

  return false;
}

async function askDisambiguation(phone, candidates, session) {
  const options = candidates.slice(0, 3);
  await whatsapp.sendButtons(
    phone,
    '*Which service did you mean?*\n\nTap the closest match:',
    options.map((c, i) => ({ id: `nl_pick_${i}`, title: c.label.slice(0, 24) }))
  );
  setSession(phone, {
    ...session,
    step: NL_DISAMBIGUATE_STEP,
    activeService: null,
    data: {
      ...(session.data?.nlHistory ? { nlHistory: session.data.nlHistory } : {}),
      nlCandidates: options,
    },
  });
  return true;
}

async function handleDisambiguationChoice(phone, choice, session) {
  const idx = Number(String(choice).replace('nl_pick_', ''));
  const picked = session?.data?.nlCandidates?.[idx];
  if (!picked) {
    await whatsapp.sendText(phone, 'That option expired. Say what you need again, e.g. *fund my sportybet account*.');
    return true;
  }
  const intent = {
    service: picked.service,
    action: picked.action,
    params: picked.params || {},
    confidence: 'high',
  };
  return executeNaturalLanguage(phone, intent, { phone, session: getSession(phone), text: '' });
}

/** Wizard steps where NL must not re-start orders (prevents duplicate lists/menus). */
const STRUCTURED_FLOW_STEPS = {
  airtime: new Set([
    'airtime_pick_network',
    'airtime_pick_recipient',
    'airtime_enter_phone',
    'airtime_pick_period',
    'airtime_pick_bundle',
    'airtime_pick_amount',
    'airtime_enter_amount',
    'airtime_confirm',
    'airtime_bulk_recipients',
    'airtime_bulk_confirm',
    // legacy step ids (sessions mid-flow before deploy)
    'pick_network',
    'pick_recipient',
    'enter_phone',
    'pick_period',
    'pick_bundle',
    'pick_amount',
    'enter_amount',
  ]),
  bills: new Set([
    'pick_disco',
    'pick_bookmaker',
    'enter_detail',
    'pick_package',
    'pick_amount',
    'enter_amount',
  ]),
  food: new Set([
    'food_location',
    'food_stores',
    'food_categories',
    'food_items',
    'food_quantity',
    'food_cart',
    'food_confirm',
  ]),
  wallet: new Set(['wallet_menu', 'topup_amount', 'topup_other_phone']),
};

function isStructuredServiceFlow(session) {
  if (!session?.activeService) return false;
  const steps = STRUCTURED_FLOW_STEPS[session.activeService];
  return steps ? steps.has(session.step) : false;
}

function toLocalPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('234')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0')) return digits;
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

async function replyHelp(phone) {
  await whatsapp.sendText(phone, buildServicesListText());
}

async function replyListServices(phone) {
  await whatsapp.sendText(phone, buildServicesListText());
  return true;
}

async function handleAiChat(phone, text, session) {
  if (!config.openai.apiKey) {
    if (isServicesQuestion(text)) return replyListServices(phone);
    await whatsapp.sendText(
      phone,
      `I'm your Mysogi assistant 🤖\n\n${buildServicesListText().split('\n\n').slice(1).join('\n\n')}`
    );
    return true;
  }

  await whatsapp.sendText(phone, '⏳ One moment…');
  const data = session.data || {};
  const response = await ai.chat({
    model: config.openai.model,
    temperature: 0.7,
    max_tokens: 600,
    messages: [
      { role: 'system', content: buildChatAssistantPrompt() },
      ...(data.nlHistory || []).slice(-6),
      { role: 'user', content: text },
    ],
  });

  const history = [
    ...(data.nlHistory || []),
    { role: 'user', content: text },
    { role: 'assistant', content: response.text },
  ];
  setSession(phone, {
    ...session,
    step: 'super_menu',
    activeService: null,
    data: { ...data, nlHistory: history.slice(-10) },
  });

  await whatsapp.sendText(phone, response.text);
  return true;
}

async function launchIntoBulkAirtime(phone, partial, ctx) {
  const airtimeSvc = getService('airtime');
  const ctxObj = ctx || createContext(phone, {}, getSession(phone), getUser(phone));

  const recipients = [];
  for (const p of partial.phones || []) {
    recipients.push({ name: p, phone: contactStore.toLocalPhone(p) });
  }
  if (partial.contact_names?.length) {
    const { resolved, ambiguous, missing } = await contactStore.resolveContactNames(phone, partial.contact_names);
    if (ambiguous.length) {
      const lines = ambiguous.map((a) => `*${a.query}*: ${a.matches.map((m) => m.name).join(', ')}`).join('\n');
      await whatsapp.sendText(phone, `Which contact?\n\n${lines}\n\nSay the full name or number.`);
      return true;
    }
    if (missing.length) {
      await whatsapp.sendText(
        phone,
        `I don't have *${missing.join(', ')}* saved.\n\nShare their contact card or: *save contact Name 080…*`
      );
      return true;
    }
    recipients.push(...resolved);
  }

  const seed = {
    recipients: airtimeSvc.dedupeRecipients(recipients),
    network: partial.network || null,
    amount: partial.amount || null,
  };

  if (!seed.recipients.length) {
    return airtimeSvc.startBulkFlow(ctxObj);
  }

  await airtimeSvc.startBulkFlow(ctxObj, seed);
  const bulkState = { type: 'airtime', recipients: seed.recipients, network: seed.network, amount: seed.amount };
  if (seed.network && seed.amount && seed.amount >= 100) {
    return airtimeSvc.showBulkConfirm(ctxObj, bulkState);
  }
  if (seed.network && seed.recipients.length) {
    return airtimeSvc.showBulkAmountPicker(ctxObj, bulkState);
  }
  return true;
}

async function launchIntoTelecomFlow(phone, partial, ctx) {
  const airtimeSvc = getService('airtime');
  const session = getSession(phone) || { step: 'idle', data: {} };
  const ctxObj = ctx || createContext(phone, {}, session, getUser(phone));

  if (
    partial.bulk ||
    (partial.phones && partial.phones.length > 1) ||
    (partial.contact_names && partial.contact_names.length > 1)
  ) {
    return launchIntoBulkAirtime(phone, partial, ctxObj);
  }

  if (partial.recipient === 'named' && partial.contact_names?.length === 1 && !partial.phone) {
    const resolved = await contactStore.resolveContactName(phone, partial.contact_names[0]);
    if (resolved.ok) {
      partial.phone = resolved.contact.phone;
      partial.recipient = 'other';
    } else if (resolved.ambiguous) {
      await whatsapp.sendText(
        phone,
        `Several matches for *${partial.contact_names[0]}*:\n` +
          resolved.matches.map((m) => `• ${m.name} — ${m.phone}`).join('\n')
      );
      return true;
    } else {
      await whatsapp.sendText(phone, resolved.message);
      return true;
    }
  }

  const airtime = {
    type: partial.type === 'data' ? 'data' : 'airtime',
    network: partial.network || null,
    phone: partial.phone || (partial.recipient === 'other' ? null : toLocalPhone(phone)),
    recipientType: partial.recipient === 'other' ? 'other' : 'self',
    amount: partial.amount ? Number(partial.amount) : null,
    plan: partial.plan || partial.value || null,
    value: partial.plan || partial.value || null,
    period: partial.period || null,
  };

  if (!airtime.network) {
    return airtimeSvc.showNetworkPicker(ctxObj, airtime.type);
  }

  if (airtime.recipientType === 'other' && !airtime.phone) {
    return airtimeSvc.showRecipientPicker(ctxObj, airtime);
  }

  airtime.phone = airtime.phone || toLocalPhone(phone);

  if (airtime.type === 'data') {
    if (airtime.plan) {
      const resolved = await telecom.resolveDataPlan(airtime.network, airtime.plan);
      if (resolved.ok) {
        airtime.resolvedPlan = resolved;
        airtime.amount = resolved.amount;
        airtime.value = resolved.variationCode || airtime.plan;
        return airtimeSvc.showConfirm(ctxObj, airtime);
      }
    }

    if (!airtime.network) {
      return airtimeSvc.showNetworkPicker(ctxObj, 'data');
    }

    const draft = { ...airtime, type: 'data' };
    const period = airtime.period
      ? `data_period_${String(airtime.period).replace('data_period_', '')}`
      : airtime.dataPeriod;

    if (!period || !['data_period_daily', 'data_period_weekly', 'data_period_monthly'].includes(period)) {
      return airtimeSvc.showDataPeriodPicker(ctxObj, draft);
    }

    draft.dataPeriod = period;

    if (draft.recipientType === 'other' && !draft.phone) {
      return airtimeSvc.showRecipientPicker(ctxObj, draft);
    }

    draft.phone = draft.phone || toLocalPhone(phone);
    return airtimeSvc.showDataBundles(ctxObj, draft, period, 0);
  }

  if (airtime.amount && airtime.amount >= 50) {
    return airtimeSvc.showConfirm(ctxObj, airtime);
  }
  return airtimeSvc.showAirtimeAmounts(ctxObj, airtime);
}

async function resolveBookmakerFromCatalog(name) {
  const bookmakers = await telecom.getBettingBookmakers();
  let search = String(name || '').toLowerCase().replace(/\s/g, '');
  if (/sporty?ing|sporty/.test(search)) search = 'sportybet';
  return bookmakers.find((b) => {
    const bn = b.name.toLowerCase().replace(/\s/g, '');
    const bc = (b.code || '').toLowerCase();
    return bn.includes(search) || search.includes(bn) || (bc && search.includes(bc));
  });
}

async function launchIntoBettingFlow(phone, params, ctx) {
  const billsSvc = getService('bills');
  const session = getSession(phone) || { step: 'idle', data: {} };
  const ctxObj = ctx || createContext(phone, {}, session, getUser(phone));

  if (!params.bookmaker) {
    return billsSvc.showBookmakerPicker(ctxObj);
  }

  const bookmaker = await resolveBookmakerFromCatalog(params.bookmaker);
  if (!bookmaker) {
    await whatsapp.sendText(phone, `Couldn't find *${params.bookmaker}*. Pick from the list:`);
    return billsSvc.showBookmakerPicker(ctxObj);
  }

  const bill = {
    type: 'betting',
    productId: bookmaker.id,
    bookmakerName: bookmaker.name,
    customerId: params.customer_id || params.customerId || null,
    amount: params.amount ? Number(params.amount) : null,
  };

  if (!bill.customerId) {
    await whatsapp.sendText(ctxObj.phone, `*${bookmaker.name}*\n\nEnter your *Customer / User ID*:`);
    setSession(phone, {
      activeService: 'bills',
      step: 'enter_detail',
      data: { bill: { type: 'betting', productId: bookmaker.id, bookmakerName: bookmaker.name } },
    });
    return true;
  }

  if (!bill.amount || bill.amount < 100) {
    const BETTING_AMOUNTS = [500, 1000, 2000, 5000, 10000];
    return billsSvc.showAmountPicker(ctxObj, bill, BETTING_AMOUNTS, bookmaker.name);
  }

  return showBillConfirm(phone, bill);
}

async function routeToServiceLazy(phone, serviceId, ctx) {
  const { routeToService } = require('./superAppRouter');
  return routeToService(phone, serviceId, ctx || { phone, session: getSession(phone), incoming: {} });
}

async function showAirtimeConfirm(phone, airtime) {
  const svc = getService('airtime');
  const pricing = wallet.formatWalletSummary(airtime.amount);
  const buttons = [
    { id: 'air_confirm', title: 'Pay from wallet' },
    { id: 'air_cancel', title: 'Cancel' },
  ];

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
      return completeTelecomDraft(phone, draft, session);
    }
    if (draft.action === 'pay_bill') {
      return completeBillDraft(phone, draft);
    }
    if (draft.action === 'buy_betting') {
      return completeBettingDraft(phone, draft, session);
    }
  }

  const field = missing[0];

  if ((draft.action === 'buy_data' && field === 'plan') || (draft.action === 'buy_airtime' && field === 'amount' && draft.params.network)) {
    return launchIntoTelecomFlow(phone, { ...draft.params, type: draft.action === 'buy_data' ? 'data' : 'airtime' }, null);
  }

  if (draft.action === 'buy_betting' && field === 'bookmaker') {
    return launchIntoBettingFlow(phone, draft.params, null);
  }

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

async function completeTelecomDraft(phone, draft, session = {}) {
  const airtime = draftToAirtime(draft);

  if (!airtime.network || !NETWORKS.includes(airtime.network)) {
    return launchIntoTelecomFlow(phone, { ...draft.params, type: draft.action === 'buy_data' ? 'data' : 'airtime' }, null);
  }

  if (airtime.type === 'data') {
    const plan = airtime.plan || airtime.value;
    if (!plan) {
      return launchIntoTelecomFlow(phone, { ...draft.params, type: 'data' }, null);
    }
    airtime.value = plan;
    const resolved = await telecom.resolveDataPlan(airtime.network, plan);
    if (!resolved.ok) {
      await whatsapp.sendText(phone, `${resolved.message}\n\n_Pick a bundle from the list instead._`);
      return launchIntoTelecomFlow(phone, { ...draft.params, type: 'data', plan: null }, null);
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
    const billsSvc = getService('bills');
    const ctxObj = createContext(phone, {}, getSession(phone), getUser(phone));
    if (bill.type === 'electricity' && bill.meter) {
      const ELECTRIC_AMOUNTS = [1000, 2000, 3000, 5000, 10000];
      return billsSvc.showAmountPicker(ctxObj, bill, ELECTRIC_AMOUNTS, `${bill.provider || 'Electricity'}`);
    }
    if (bill.smartcard && bill.type && bill.type !== 'betting') {
      return billsSvc.showCablePackages(ctxObj, bill.type, bill.smartcard);
    }
    await whatsapp.sendText(phone, 'Minimum bill payment is *₦100*. Enter amount:');
    const nextDraft = { ...draft, params: { ...draft.params, amount: null } };
    return continueFromDraft(phone, nextDraft);
  }
  await showBillConfirm(phone, bill);
  return true;
}

async function completeBettingDraft(phone, draft, session = {}) {
  return launchIntoBettingFlow(phone, draft.params, createContext(phone, {}, session, getUser(phone)));
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
  const buttons = [
    { id: 'bill_confirm', title: 'Pay from wallet' },
    { id: 'bill_cancel', title: 'Cancel' },
  ];

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

async function startBettingFromIntent(phone, params, ctx) {
  const session = getSession(phone) || { step: 'idle', data: {} };
  const existing = session.data?.nlDraft;

  let mergedParams = { ...params, bill_type: 'betting' };
  if (existing?.action === 'buy_betting') {
    mergedParams = { ...existing.params, ...mergedParams };
  }

  const draft = createBettingDraft(mergedParams);
  const missing = getMissingFields(draft);
  if (missing.length === 0) {
    return completeBettingDraft(phone, draft, session);
  }
  return continueFromDraft(phone, draft, session);
}

async function tryConfirmFromText(phone, text, session) {
  const confirmSteps = new Set(['confirm', 'airtime_confirm']);
  if (!confirmSteps.has(session.step) || !session.activeService) return false;

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

  try {
    return await _executeNaturalLanguage(phone, intent, ctx);
  } catch (err) {
    logger.error('NL execute failed', {
      phone,
      service: intent.service,
      action: intent.action,
      error: err.message,
      stack: err.stack,
    });
    await whatsapp.sendText(
      phone,
      `I couldn't finish that order just now.\n\nTry again, tap *menu*, or continue with the buttons above if you're mid-flow.`
    );
    return true;
  }
}

async function _executeNaturalLanguage(phone, intent, ctx) {
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

  if (action === 'list_services') {
    return replyListServices(phone);
  }

  if (action === 'help') {
    await replyHelp(phone);
    return true;
  }

  if (action === 'greet') {
    await whatsapp.sendText(phone, `Hello! 👋 I'm your Mysogi assistant.\n\nJust tell me what you need — airtime, data, bills, betting, wallet, and more.\n\n_Type *services* to see everything I can do._`);
    await showSuperAppMenu(phone);
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

  if (action === 'buy_betting') {
    return startBettingFromIntent(phone, params, ctx);
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
  if (incoming.buttonId?.startsWith('nl_pick_')) return true;
  if (!incoming.text || incoming.buttonId || incoming.listId) return false;

  const text = incoming.text.trim();
  if (text.length < 2) return false;

  if (/^(menu|home|start|0|cancel|stop)$/i.test(text)) return false;

  if (session.step === NL_DISAMBIGUATE_STEP) return false;

  if (isStructuredServiceFlow(session)) {
    if (isWizardAnswer(text) && !isBettingRequest(text) && !isNewOrderOverride(text, session?.data?.nlDraft)) {
      return false;
    }
    return isNewPurchaseMessage(text, session);
  }

  if (isServicesQuestion(text)) return true;

  if (session.step === NL_GATHER_STEP || session.data?.nlDraft) {
    if (isNewOrderOverride(text, session.data.nlDraft)) return true;
    if (/^(mtn|glo|airtel|9mobile|etisalat)$/i.test(text)) return true;
    if (/^\d{2,7}$/.test(text)) return true;
    return true;
  }

  const confirmSteps = new Set(['confirm', 'airtime_confirm']);
  if (confirmSteps.has(session.step) && (isAffirmation(text) || isDenial(text))) return true;

  if (isOrderPhrase(text)) {
    if (session.activeService && session.step !== NL_GATHER_STEP && /^[₦]?\d+([.,]\d+)?$/.test(text)) {
      return false;
    }
    return true;
  }

  if (isGeneralQuestion(text) && config.openai.apiKey) return true;

  if (session.activeService && session.step !== NL_GATHER_STEP && /^[₦]?\d+([.,]\d+)?$/.test(text)) {
    return false;
  }

  if (!session.activeService || session.step === 'super_menu' || session.step === 'idle') return true;

  if (/[a-zA-Z]{3,}/.test(text) && text.length >= 4) return true;

  return false;
}

async function tryNaturalLanguageRoute(phone, incoming, ctx) {
  try {
    const session = ctx.session || getSession(phone);

    if (incoming.buttonId?.startsWith('nl_pick_')) {
      return handleDisambiguationChoice(phone, incoming.buttonId, session);
    }

    if (!shouldTryNaturalLanguage(session, incoming)) return false;

    const { requiresAuth, promptLoginRequired } = require('./authHandler');

    if (await tryConfirmFromText(phone, incoming.text, session)) return true;

    if (await tryContinueDraft(phone, incoming.text, session)) return true;

    const { parseNaturalLanguage } = require('./intentRouter');
    const { enrichIntent } = require('./nlOrderParser');
    let intent = await parseNaturalLanguage(incoming.text);

    if (!intent) {
      const fallback = regexOrderIntent(incoming.text);
      if (fallback) intent = enrichIntent(fallback, incoming.text);
    }

    if (!intent) {
      if (isGeneralQuestion(incoming.text) && config.openai.apiKey) {
        return handleAiChat(phone, incoming.text, session);
      }
      if (isOrderPhrase(incoming.text)) {
        const candidates = detectAmbiguousIntents(incoming.text);
        if (candidates.length >= 2) {
          return askDisambiguation(phone, candidates, session);
        }
        if (candidates.length === 1) {
          intent = {
            service: candidates[0].service,
            action: candidates[0].action,
            params: candidates[0].params || {},
            confidence: 'medium',
          };
        }
      }
      if (!intent) return false;
    }

    const ambiguous = detectAmbiguousIntents(incoming.text);
    if (
      ambiguous.length >= 2 &&
      intent.confidence !== 'high' &&
      isPurchaseIntent(intent)
    ) {
      const intentKey = `${intent.service}:${intent.action}`;
      const otherMatches = ambiguous.filter((c) => `${c.service}:${c.action}` !== intentKey);
      if (otherMatches.length >= 1) {
        return askDisambiguation(phone, ambiguous, session);
      }
    }

    const publicActions = new Set(['menu', 'help', 'list_services', 'login', 'signup', 'chat', 'greet']);
    if (requiresAuth(phone) && !publicActions.has(intent.action)) {
      await promptLoginRequired(phone);
      return true;
    }

    if (intent.confidence === 'low' && !intent.service) {
      if (intent.action === 'chat' || isGeneralQuestion(incoming.text)) {
        return handleAiChat(phone, incoming.text, session);
      }
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
  } catch (err) {
    logger.error('NL route failed', {
      phone,
      error: err.message,
      stack: err.stack,
    });
    await whatsapp.sendText(
      phone,
      `I didn't quite catch that.\n\nTry again — e.g. *fund my sportybet account* — or type *menu*.`
    );
    return true;
  }
}

module.exports = {
  executeNaturalLanguage,
  shouldTryNaturalLanguage,
  tryNaturalLanguageRoute,
  tryContinueDraft,
  isStructuredServiceFlow,
  handleDisambiguationChoice,
  NL_GATHER_STEP,
  NL_DISAMBIGUATE_STEP,
};
