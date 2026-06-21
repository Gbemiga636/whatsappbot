/**
 * Natural language intent — OpenAI structured parsing + regex fallback.
 */

const { SERVICES } = require('./serviceRegistry');
const config = require('../config');
const ai = require('../providers/openai');
const logger = require('../core/logger');
const { enrichIntent, regexOrderIntent, normalizeNetwork } = require('./nlOrderParser');

function classifyQuickCommand(text) {
  const t = (text || '').trim();
  if (!t) return null;

  for (const cmd of QUICK_COMMANDS) {
    const m = t.match(cmd.match);
    if (!m) continue;
    const intent = {
      service: cmd.service || 'none',
      action: cmd.action,
      params: {},
      confidence: 'high',
    };
    if (cmd.action === 'topup' && m[1]) intent.params.amount = Number(m[1]);
    return intent;
  }
  return null;
}

const VALID_SERVICES = SERVICES.map((s) => s.id);

const LIVE_SERVICES = SERVICES.filter((s) => s.live !== false).map((s) => s.id);

const INTENT_PATTERNS = [
  { service: 'wallet', patterns: [/wallet|fund wallet|add money to wallet|check balance/i] },
  { service: 'airtime', patterns: [/airtime|recharge|load(?:\s+my)?\s+line|vtu|mtn|glo|airtel|9mobile/i] },
  { service: 'airtime', patterns: [/data plan|buy data|\d+\s*gb|\d+\s*mb/i], defaultAction: 'buy_data' },
  { service: 'bills', patterns: [/electricity|nepa|phcn|meter|dstv|gotv|startimes|cable|tv subscription|bill pay|pay bill/i] },
  { service: 'food', patterns: [/order food|jollof|rice|restaurant|hungry|lunch|dinner|pizza|shawarma/i] },
  { service: 'shopping', patterns: [/shop|grocery|supermarket|bread|milk|iphone/i] },
  { service: 'loans', patterns: [/loan|borrow|credit line|bnpl|pay later|instant credit|mysogi credit|activate credit/i] },
  { service: 'ads', patterns: [/ad |advert|campaign|billboard|flyer|marketing|promote|create ad/i] },
  { service: 'travel', patterns: [/flight|hotel|book trip|visa|travel|lagos to abuja/i] },
  { service: 'business', patterns: [/invoice|crm|collect payment|business tool/i] },
  { service: 'healthcare', patterns: [/doctor|pharmacy|medicine|paracetamol|hospital|lab test/i] },
  { service: 'marketplace', patterns: [/sell my|marketplace|list item|buy phone|buy car/i] },
  { service: 'education', patterns: [/waec|jamb|school fee|tutor|homework|study/i] },
  { service: 'agriculture', patterns: [/farm|fertilizer|crop|agric|produce|harvest/i] },
  { service: 'jobs', patterns: [/job|hire|recruit|cv|resume|apply for/i] },
  { service: 'partners', patterns: [/partner|book service|plumber|cleaning|delivery partner/i] },
  { service: 'banking', patterns: [/transfer|send money|bank account|send \d/i] },
  { service: 'ai', patterns: [/^(help|what can you do|assist me)/i] },
];

const QUICK_COMMANDS = [
  { match: /^(menu|home|start|0)$/i, action: 'menu' },
  { match: /^(help|\?|what can you do)$/i, action: 'help' },
  { match: /^(logout|log out|sign out)$/i, action: 'logout' },
  { match: /^(login|log in|sign in)$/i, action: 'login' },
  { match: /^(signup|sign up|register)$/i, action: 'signup' },
  { match: /^(balance|my balance|wallet balance|check balance)$/i, action: 'balance', service: 'wallet' },
  { match: /(set|create).*(pin|password)/i, action: 'set_pin', service: 'wallet' },
  { match: /change.*(pin|password)/i, action: 'change_pin', service: 'wallet' },
  { match: /^top up(?:\s+(\d+))?$/i, action: 'topup', service: 'wallet' },
  { match: /(?:fund|add).*(?:wallet|my wallet).*?(\d{3,})/i, action: 'topup', service: 'wallet' },
];

function parseJsonFromAi(text) {
  const raw = (text || '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}


function classifyIntentRegex(text) {
  if (!text || text.length < 3) return null;
  const t = text.trim();

  const regexOrder = regexOrderIntent(t);
  if (regexOrder) return regexOrder;

  for (const { service, patterns, defaultAction } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(t))) {
      const action = defaultAction || (/balance/i.test(t) ? 'balance' : 'open');
      const params = {};
      const amountMatch = t.match(/₦?\s*(\d{3,})/);
      if (amountMatch) params.amount = Number(amountMatch[1]);
      params.network = normalizeNetwork(t);
      return { service, action, params, confidence: 'medium' };
    }
  }
  return null;
}

function buildServiceCatalog() {
  return SERVICES.map((s) => `${s.id}${s.live === false ? ' (coming soon)' : ''}`).join(', ');
}

async function classifyIntentWithAI(text) {
  if (!config.openai.apiKey) return null;

  try {
    const response = await ai.chat({
      model: config.openai.model,
      temperature: 0.1,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content:
            `You are the intent router for Mysogi, a Nigerian WhatsApp super-app.\n` +
            `Parse the user message and reply with ONLY valid JSON (no markdown):\n` +
            `{"service":"<id>","action":"<action>","params":{},"confidence":"high|medium|low"}\n\n` +
            `Services: ${buildServiceCatalog()}\n\n` +
            `Actions:\n` +
            `- open — open service menu\n` +
            `- menu — main menu\n` +
            `- help — what Mysogi can do\n` +
            `- logout, login, signup\n` +
            `- balance — wallet balance\n` +
            `- topup — wallet top-up (params.amount number)\n` +
            `- set_pin, change_pin\n` +
            `- buy_airtime, buy_data — params: network (MTN|GLO|Airtel|9mobile), amount (number), recipient (self|other), phone (080...)\n` +
            `- pay_bill — params: bill_type (electricity|dstv|gotv|startimes), meter, provider (IKEDC etc), smartcard, amount\n` +
            `- credit — loans/credit hub\n` +
            `- activate_credit\n` +
            `- chat — ONLY for general knowledge questions, NOT orders\n\n` +
            `IMPORTANT rules:\n` +
            `- If the user says "airtime", ALWAYS use buy_airtime — never buy_data.\n` +
            `- buy_data ONLY when user mentions data, GB, MB, bundle, or internet plan.\n` +
            `- "buy credit", "load my line", "top up MTN" = buy_airtime (Nigerian slang for airtime).\n` +
            `- Network + amount without data plan = buy_airtime (e.g. "MTN 500" = ₦500 airtime).\n` +
            `- "top up wallet" or bare "top up 2000" = wallet topup. "top up MTN line" = buy_airtime.\n` +
            `- If user wants to buy/pay/order anything, use buy_airtime, buy_data, or pay_bill — NOT open or chat.\n\n` +
            `Examples:\n` +
            `"get me airtime" → {"service":"airtime","action":"buy_airtime","params":{"recipient":"self"},"confidence":"high"}\n` +
            `"I need 500 naira MTN airtime" → {"service":"airtime","action":"buy_airtime","params":{"network":"MTN","amount":500,"recipient":"self"},"confidence":"high"}\n` +
            `"Can you help me buy airtel airtime 100 naira for myself" → {"service":"airtime","action":"buy_airtime","params":{"network":"Airtel","amount":100,"recipient":"self"},"confidence":"high"}\n` +
            `"get me MTN 500" → {"service":"airtime","action":"buy_airtime","params":{"network":"MTN","amount":500,"recipient":"self"},"confidence":"high"}\n` +
            `"buy credit on glo 200" → {"service":"airtime","action":"buy_airtime","params":{"network":"GLO","amount":200,"recipient":"self"},"confidence":"high"}\n` +
            `"top up my MTN line with 500" → {"service":"airtime","action":"buy_airtime","params":{"network":"MTN","amount":500,"recipient":"self"},"confidence":"high"}\n` +
            `"send 1000 glo to 08012345678" → {"service":"airtime","action":"buy_airtime","params":{"network":"GLO","amount":1000,"recipient":"other","phone":"08012345678"},"confidence":"high"}\n` +
            `"buy 2gb mtn data" → {"service":"airtime","action":"buy_data","params":{"network":"MTN","plan":"2GB","recipient":"self"},"confidence":"high"}\n` +
            `"pay dstv 7500" → {"service":"bills","action":"pay_bill","params":{"bill_type":"dstv","amount":7500},"confidence":"high"}\n` +
            `"pay electricity 45012345678 IKEDC 3000" → {"service":"bills","action":"pay_bill","params":{"bill_type":"electricity","meter":"45012345678","provider":"IKEDC","amount":3000},"confidence":"high"}\n` +
            `"top up my wallet with 2000" → {"service":"wallet","action":"topup","params":{"amount":2000},"confidence":"high"}\n` +
            `"what's my balance" → {"service":"wallet","action":"balance","params":{},"confidence":"high"}\n` +
            `"I want to create an ad" → {"service":"ads","action":"open","params":{},"confidence":"high"}\n` +
            `"who is the president of france" → {"service":"ai","action":"chat","params":{},"confidence":"high"}\n` +
            `Unclear small talk → {"service":"none","action":"chat","params":{},"confidence":"low"}`,
        },
        { role: 'user', content: text.trim().slice(0, 600) },
      ],
    });

    const parsed = parseJsonFromAi(response.text);
    if (!parsed?.action) return null;

    const service = String(parsed.service || 'none').toLowerCase();
    const action = String(parsed.action || 'open').toLowerCase();

    if (service !== 'none' && !VALID_SERVICES.includes(service)) return null;

    return enrichIntent(
      {
        service: service === 'none' ? null : service,
        action,
        params: parsed.params && typeof parsed.params === 'object' ? parsed.params : {},
        confidence: parsed.confidence || 'medium',
      },
      text
    );
  } catch (err) {
    logger.warn('AI intent classification failed', { error: err.message });
    return null;
  }
}

async function parseNaturalLanguage(text) {
  if (!text || text.trim().length < 2) return null;

  const quick = classifyQuickCommand(text);
  if (quick) return enrichIntent(quick, text);

  const regexOrder = regexOrderIntent(text);
  if (regexOrder) return enrichIntent(regexOrder, text);

  if (config.openai.apiKey && config.features.naturalLanguage) {
    const aiResult = await classifyIntentWithAI(text);
    if (aiResult) return enrichIntent(aiResult, text);
  }

  const regexResult = classifyIntentRegex(text);
  if (regexResult) return enrichIntent(regexResult, text);

  return null;
}

/** @deprecated use parseNaturalLanguage */
async function classifyIntent(text) {
  const intent = await parseNaturalLanguage(text);
  return intent?.service || null;
}

async function routeByIntent(text) {
  const intent = await parseNaturalLanguage(text);
  if (!intent?.service) return null;
  const { getService } = require('./serviceRegistry');
  return getService(intent.service);
}

module.exports = {
  parseNaturalLanguage,
  classifyIntent,
  classifyIntentRegex,
  classifyIntentWithAI,
  routeByIntent,
  normalizeNetwork,
  INTENT_PATTERNS,
  LIVE_SERVICES,
};
