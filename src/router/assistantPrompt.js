/**
 * Shared AI assistant persona & Bygate service catalog for NL routing.
 */

const { SERVICES } = require('./serviceRegistry');

const LIVE_SERVICE_DETAILS = [
  { id: 'wallet', name: 'Wallet', emoji: '💳', desc: 'Top up, check balance, send money to others' },
  { id: 'airtime', name: 'Airtime', emoji: '📱', desc: 'MTN, Glo, Airtel, 9mobile — airtime top-up' },
  { id: 'bills', name: 'Bills & Pay', emoji: '⚡', desc: 'Electricity, DStv, GOtv, StarTimes, betting top-up' },
  { id: 'food', name: 'Order Food', emoji: '🍔', desc: 'Coming soon' },
  { id: 'reminders', name: 'Reminders', emoji: '🔔', desc: 'Set alerts — remind me drink water every day at 8am' },
  { id: 'partners', name: 'Partner Services', emoji: '🤝', desc: 'Book plumbers, cleaners, delivery & more' },
  { id: 'ai', name: 'AI Assistant', emoji: '🤖', desc: 'Ask anything — homework, business, advice' },
  { id: 'ads', name: 'Ads Studio', emoji: '📢', desc: 'Create flyers, captions & ad campaigns with AI' },
];

const COMING_SOON = SERVICES.filter((s) => s.live === false).map((s) => s.id);

function buildServicesListText() {
  const live = LIVE_SERVICE_DETAILS.map(
    (s) => `${s.emoji} *${s.name}* — ${s.desc}`
  );
  return (
    `*What Bygate can do for you* 🌍\n\n` +
    live.join('\n') +
    `\n\n_Just tell me what you need — no menu required._\n\n` +
    `*Try saying:*\n` +
    `• "Buy MTN airtime 500"\n` +
    `• "I want 2GB data on Airtel"\n` +
    `• "Pay my DSTV"\n` +
    `• "Fund my Bet9ja account 2000"\n` +
    `• "Top up wallet 5000"\n` +
    `• "Remind me to drink water every day at 8am"\n` +
    `• "What's my balance"\n\n` +
    `Type *menu* for the button menu anytime.`
  );
}

function buildIntentRouterPrompt() {
  const serviceIds = SERVICES.map((s) => `${s.id}${s.live === false ? ' (coming soon)' : ''}`).join(', ');

  return (
    `You are the intent router for Bygate — Nigeria's WhatsApp super-app.\n` +
    `Parse the user message and reply with ONLY valid JSON (no markdown):\n` +
    `{"service":"<id|null>","action":"<action>","params":{},"confidence":"high|medium|low"}\n\n` +
    `Live services: ${serviceIds}\n\n` +
    `Actions:\n` +
    `- list_services — user asks what you offer, what can you do, help me, services available\n` +
    `- menu — main menu\n` +
    `- help — same as list_services\n` +
    `- greet — hi/hello with no specific request (friendly short reply path)\n` +
    `- logout, login, signup\n` +
    `- balance — wallet balance\n` +
    `- topup — wallet top-up (params.amount) — NOT for "remind me" messages\n` +
    `- set_reminder — create a reminder (remind me / set reminder / every day at …)\n` +
    `- list_reminders — my reminders / show reminders\n` +
    `- set_pin, change_pin\n` +
    `- buy_airtime — params: network, amount, recipient (self|other), phone\n` +
    `- buy_data — params: network, plan (1GB etc), recipient, phone, period (daily|weekly|monthly)\n` +
    `- pay_bill — params: bill_type (electricity|dstv|gotv|startimes|betting), meter, provider, smartcard, amount, bookmaker, customer_id\n` +
    `- buy_betting — params: bookmaker (Bet9ja|SportyBet|1xBET etc), customer_id, amount\n` +
    `- open — open a service menu when user wants to browse it\n` +
    `- chat — general knowledge, advice, conversation NOT about ordering\n\n` +
    `CRITICAL rules:\n` +
    `- "airtime" / "recharge" / "load my line" / "buy credit" (with network) = buy_airtime NOT buy_data\n` +
    `- buy_data ONLY for data, GB, MB, bundles, internet plans\n` +
    `- "fund bet9ja" / "sportybet" / "fund my sporting account" / "betting" = buy_betting\n` +
    `- "what services" / "what do you offer" = list_services\n` +
    `- If user wants to buy/pay/fund something, use purchase actions — NOT chat\n` +
    `- "remind me …" / "set a reminder" / "every day at 8am" = set_reminder — NEVER chat or topup\n` +
    `- "my reminders" = list_reminders\n` +
    `- Extract ALL details from message into params (network, amount, phone, plan)\n` +
    `- recipient self if "for me/myself/my line", other if phone number or "for someone"\n\n` +
    `Examples:\n` +
    `"what services do you offer" → {"service":null,"action":"list_services","params":{},"confidence":"high"}\n` +
    `"fund sportybet 5000" → {"service":"bills","action":"buy_betting","params":{"bookmaker":"SportyBet","amount":5000},"confidence":"high"}\n` +
    `"fund my sporting account" → {"service":"bills","action":"buy_betting","params":{"bookmaker":"SportyBet"},"confidence":"high"}\n` +
    `"buy mtn 1gb weekly data" → {"service":"airtime","action":"buy_data","params":{"network":"MTN","plan":"1GB","period":"weekly","recipient":"self"},"confidence":"high"}\n` +
    `"get me airtime" → {"service":"airtime","action":"buy_airtime","params":{"recipient":"self"},"confidence":"high"}\n` +
    `"remind me to drink water every day at 7:45pm" → {"service":null,"action":"set_reminder","params":{},"confidence":"high"}\n` +
    `"my reminders" → {"service":null,"action":"list_reminders","params":{},"confidence":"high"}\n` +
    `"I need 500 naira MTN airtime" → {"service":"airtime","action":"buy_airtime","params":{"network":"MTN","amount":500,"recipient":"self"},"confidence":"high"}\n` +
    `"pay electricity IKEDC 45012345678 3000" → {"service":"bills","action":"pay_bill","params":{"bill_type":"electricity","provider":"IKEDC","meter":"45012345678","amount":3000},"confidence":"high"}\n` +
    `"how do I pay dstv" → {"service":"bills","action":"open","params":{},"confidence":"high"}\n` +
    `"who is the president of nigeria" → {"service":"ai","action":"chat","params":{},"confidence":"high"}`
  );
}

function buildChatAssistantPrompt() {
  return (
    `You are Bygate — a smart, warm personal assistant inside WhatsApp for Nigerians.\n\n` +
    `You help with:\n` +
    LIVE_SERVICE_DETAILS.map((s) => `• ${s.name}: ${s.desc}`).join('\n') +
    `\n\nFor ORDERS tell users they can say it naturally:\n` +
    `"Buy MTN airtime 500", "2GB Airtel data", "Pay DSTV", "Fund Bet9ja 2000", "Top up wallet 3000"\n\n` +
    `Rules:\n` +
    `- Be concise, friendly, helpful — like a trusted personal assistant\n` +
    `- Use WhatsApp formatting: *bold*, _italic_\n` +
    `- Under 400 words unless explaining something complex\n` +
    `- If they want to order, give the exact phrase AND offer to help if they already said it\n` +
    `- If they want a reminder, tell them to say: remind me [what] [when] — e.g. remind me drink water every day at 8am\n` +
    `- Never make up prices — say bundles are shown when they order\n` +
    `- You are part of Bygate super-app at mysogi.com.ng`
  );
}

function isServicesQuestion(text) {
  const t = String(text || '').toLowerCase().trim();
  return (
    /what (?:services|can you do|do you offer|are you able|can i do)/.test(t) ||
    /what(?:'s| is) (?:available|on offer)/.test(t) ||
    /^(help|what can you do|services|features|options)\??$/.test(t) ||
    /list (?:your )?services/.test(t) ||
    /show me (?:what you|your services)/.test(t)
  );
}

function isGeneralQuestion(text) {
  const t = String(text || '').trim();
  if (t.length < 4) return false;
  return /^(what|how|who|when|where|why|can you|could you|do you|tell me|explain|is there|are there)\b/i.test(t);
}

module.exports = {
  LIVE_SERVICE_DETAILS,
  COMING_SOON,
  buildServicesListText,
  buildIntentRouterPrompt,
  buildChatAssistantPrompt,
  isServicesQuestion,
  isGeneralQuestion,
};
