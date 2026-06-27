/**
 * Natural language intent — OpenAI structured parsing + regex fallback.
 */

const { SERVICES } = require('./serviceRegistry');
const config = require('../config');
const ai = require('../providers/openai');
const logger = require('../core/logger');
const { enrichIntent, regexOrderIntent, normalizeNetwork } = require('./nlOrderParser');
const { buildIntentRouterPrompt, isServicesQuestion } = require('./assistantPrompt');

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
  { service: 'bills', patterns: [/bet9ja|sportybet|sporty|sporting|1xbet|betking|nairabet|melbet|betway|betting|fund my bet|fund.*bet|bookmaker/i], defaultAction: 'buy_betting' },
  { service: 'food', patterns: [/order food|jollof|rice|restaurant|hungry|lunch|dinner|pizza|shawarma/i] },
  { service: 'shopping', patterns: [/shop|grocery|supermarket|bread|milk|iphone/i] },
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
  { match: /^(hi|hello|hey|good\s+(morning|afternoon|evening))[\s,!?.]*$/i, action: 'greet' },
  { match: /^(help|\?|what can you do|services|features)$/i, action: 'list_services' },
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

async function classifyIntentWithAI(text) {
  if (!config.openai.apiKey) return null;

  try {
    const response = await ai.chat({
      model: config.openai.model,
      temperature: 0.1,
      max_tokens: 350,
      messages: [
        { role: 'system', content: buildIntentRouterPrompt() },
        { role: 'user', content: text.trim().slice(0, 800) },
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

  if (isServicesQuestion(text)) {
    return { service: null, action: 'list_services', params: {}, confidence: 'high' };
  }

  const quick = classifyQuickCommand(text);
  if (quick) return enrichIntent(quick, text);

  const regexOrder = regexOrderIntent(text);
  if (regexOrder) return enrichIntent(regexOrder, text);

  if (config.openai.apiKey && config.features.naturalLanguage) {
    try {
      const aiResult = await Promise.race([
        classifyIntentWithAI(text),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('AI intent timeout')), 8000)
        ),
      ]);
      if (aiResult) return enrichIntent(aiResult, text);
    } catch (err) {
      logger.warn('AI intent skipped', { error: err.message });
    }
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
