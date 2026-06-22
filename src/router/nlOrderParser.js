/**
 * Local extraction of order fields from natural language (fast, works without AI).
 */

function normalizeNetwork(raw) {
  if (!raw) return null;
  const n = String(raw).toLowerCase();
  if (n.includes('mtn')) return 'MTN';
  if (n.includes('glo')) return 'GLO';
  if (n.includes('airtel')) return 'Airtel';
  if (n.includes('9mobile') || n.includes('etisalat')) return '9mobile';
  return null;
}

function extractAmount(text, { minAmount = 50 } = {}) {
  const t = String(text || '');
  const patterns = [
    /(?:₦|ngn|naira)\s*(\d{1,7})/i,
    /(\d{1,7})\s*(?:₦|ngn|naira)/i,
    /\b(\d{1,7})\s*(?:airtime|data|worth|for)\b/i,
    /(?:buy|pay|send|recharge|load|top.?up|want|need)\s*(?:₦|naira)?\s*(\d{1,7})/i,
    /\b(\d{2,7})\b/,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      const n = Number(m[1]);
      if (n >= minAmount && n <= 500000) return n;
    }
  }
  return null;
}

function extractPhone(text) {
  const t = String(text || '');
  const m =
    t.match(/(?:for|to)\s*(234\d{10}|0\d{10})/i) ||
    t.match(/\b(234\d{10})\b/) ||
    t.match(/\b(0\d{10})\b/);
  return m ? m[1] : null;
}

function extractRecipient(text) {
  const t = String(text || '').toLowerCase();
  if (/for\s+(myself|me|my\s+self|my\s+number|my\s+phone)/i.test(t)) return 'self';
  if (extractPhone(text)) return 'other';
  if (/for\s+(someone|another|friend|him|her|them)/i.test(t)) return 'other';
  return 'self';
}

function extractBillType(text) {
  const t = String(text || '').toLowerCase();
  if (/electric|nepa|phcn|meter|ikedc|ekedc|phed|aedc|kedco|ibedc/i.test(t)) return 'electricity';
  if (/dstv/i.test(t)) return 'dstv';
  if (/gotv/i.test(t)) return 'gotv';
  if (/startimes/i.test(t)) return 'startimes';
  return null;
}

function extractMeterAndProvider(text) {
  const t = String(text || '');
  const comma = t.match(/(\d{8,15})\s*,\s*([a-zA-Z]+)/);
  if (comma) return { meter: comma[1], provider: comma[2].toUpperCase() };

  const providerMatch = t.match(/\b(IKEDC|EKEDC|AEDC|PHED|IBEDC|KEDCO|JEDC|BEDC)\b/i);
  const meterMatch = t.match(/\b(\d{10,15})\b/);
  if (meterMatch && providerMatch) {
    return { meter: meterMatch[1], provider: providerMatch[1].toUpperCase() };
  }
  if (meterMatch) return { meter: meterMatch[1], provider: null };
  return { meter: null, provider: null };
}

function extractDataPlan(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?\s*(?:gb|mb))/i);
  return m ? m[1].replace(/\s+/g, '').toUpperCase() : null;
}

/** Nigerian slang: "buy credit" / "load my line" = airtime, not loans */
function isTelecomCreditRequest(text) {
  const t = String(text || '').toLowerCase();
  if (!/\bcredit\b/i.test(t)) return false;
  if (/loan|borrow|bnpl|pay later|mysogi credit|instant credit|credit line|activate credit|credit limit/i.test(t)) {
    return false;
  }
  return /airtime|recharge|load|line|mtn|glo|airtel|9mobile|etisalat|phone|number|\d{3,}/i.test(t);
}

function isTelecomTopUp(text) {
  const t = String(text || '').toLowerCase();
  if (!/top.?up/i.test(t)) return false;
  if (/wallet/i.test(t)) return false;
  return !!(normalizeNetwork(text) || /line|airtime|phone|number|mtn|glo|airtel|9mobile/i.test(t));
}

function isWalletTopUpRequest(text) {
  const t = String(text || '').toLowerCase().trim();
  if (/wallet|fund wallet|add money to wallet|top up (?:my )?wallet/i.test(t)) return true;
  if (isTelecomTopUp(text) || isTelecomCreditRequest(text)) return false;
  if (/^top ?up(?:\s+(?:with|for))?\s*\d{3,}$/i.test(t)) return true;
  if (/^top ?up\s+\d{3,}$/i.test(t) && !normalizeNetwork(text)) return true;
  return false;
}

function isAirtimeRequest(text, params = {}) {
  const t = String(text || '').toLowerCase();
  if (/\bairtime\b/i.test(t)) return true;
  if (/\b(recharge|vtu|load(?:\s+my)?\s+line)\b/i.test(t)) return true;
  if (isTelecomCreditRequest(text) || isTelecomTopUp(text)) return true;
  if (params.plan || /\b\d+(?:\.\d+)?\s*(?:gb|mb)\b/i.test(t)) return false;
  if (/\b(data\s+plan|data\s+bundle|buy\s+data|internet\s+bundle|browse)\b/i.test(t)) return false;
  if (/\bdata\b/i.test(t) && !/\bairtime\b/i.test(t)) return false;
  if (normalizeNetwork(text) && (params.amount || /\d{2,}/.test(t))) return true;
  return false;
}

function isDataRequest(text, params = {}) {
  const t = String(text || '').toLowerCase();
  if (params.plan || /\b\d+(?:\.\d+)?\s*(?:gb|mb)\b/i.test(t)) return true;
  if (/\b(data\s+bundle|data\s+plan|buy\s+data|internet\s+bundle|browse)\b/i.test(t)) return true;
  if (/\bdata\b/i.test(t) && !/\bairtime\b/i.test(t)) return true;
  return false;
}

/**
 * Authoritative airtime vs data resolution.
 * Airtime keywords always win when both could apply.
 */
function resolveProductType(text, params = {}, action) {
  if (action === 'buy_airtime') return 'airtime';
  if (action === 'buy_data') return 'data';
  if (/\bairtime\b/i.test(text)) return 'airtime';
  if (isAirtimeRequest(text, params) && !isDataRequest(text, params)) return 'airtime';
  if (isDataRequest(text, params)) return 'data';
  if (params.amount && !params.plan) return 'airtime';
  return null;
}

function resolveTelecomAction(text, params = {}, action) {
  const type = resolveProductType(text, params, action);
  if (type === 'airtime') return 'buy_airtime';
  if (type === 'data') return 'buy_data';
  return null;
}

function extractOrderParams(text) {
  const billMeter = extractMeterAndProvider(text);
  const plan = extractDataPlan(text);
  const amount = extractAmount(text, { minAmount: isAirtimeRequest(text, { plan }) ? 20 : 50 });
  const bill_type = extractBillType(text);
  const productType = resolveProductType(text, { plan, amount });
  const isBillOrder = !!bill_type;

  return {
    network: normalizeNetwork(text),
    amount: plan ? null : amount,
    phone: extractPhone(text),
    recipient: extractRecipient(text),
    bill_type,
    meter: isBillOrder ? billMeter.meter : null,
    provider: isBillOrder ? billMeter.provider : null,
    smartcard: isBillOrder ? billMeter.meter : null,
    plan,
    type: productType || undefined,
  };
}

function isAffirmation(text) {
  return /^(yes|yeah|yep|confirm|pay|proceed|ok|go ahead|sure|do it)$/i.test(String(text || '').trim());
}

function isDenial(text) {
  return /^(no|nope|cancel|stop|abort)$/i.test(String(text || '').trim());
}

function isOrderPhrase(text) {
  const t = String(text || '').toLowerCase();
  return (
    /\b(buy|purchase|order|pay|recharge|send|top.?up|subscribe|renew|get|load|need|want)\b/.test(t) ||
    /\b(help\s+me|can\s+you|please|i\s+want\s+to|i\s+need\s+to)\b.*\b(buy|get|purchase|pay|recharge|send|top.?up)\b/.test(t) ||
    /\b(airtime|data|dstv|gotv|electricity|bill|credit|mtn|glo|airtel|9mobile)\b/.test(t)
  );
}

function isPurchaseIntent(intent) {
  if (!intent) return false;
  return ['buy_airtime', 'buy_data', 'pay_bill', 'topup', 'balance'].includes(intent.action);
}

function enrichIntent(intent, text) {
  const local = extractOrderParams(text);
  const merged = { ...local, ...(intent.params || {}) };

  for (const key of Object.keys(merged)) {
    if (merged[key] == null || merged[key] === '') delete merged[key];
  }

  if (merged.network) merged.network = normalizeNetwork(merged.network) || merged.network;

  let service = intent.service;
  let action = intent.action || 'open';
  const t = String(text || '').toLowerCase();

  const telecomAction = resolveTelecomAction(text, merged, action);
  const hasTelecomSignal =
    service === 'airtime' ||
    merged.network ||
    isAirtimeRequest(text, merged) ||
    isDataRequest(text, merged) ||
    isTelecomCreditRequest(text) ||
    isTelecomTopUp(text);

  if (hasTelecomSignal) {
    service = 'airtime';
    if (telecomAction) {
      action = telecomAction;
    } else if (isOrderPhrase(text) || merged.amount || merged.network || merged.plan) {
      action = resolveProductType(text, merged) === 'data' ? 'buy_data' : 'buy_airtime';
    }
    if (merged.plan) merged.value = merged.plan;
    merged.type = action === 'buy_data' ? 'data' : 'airtime';
  }

  if (service === 'bills' || merged.bill_type || /bill|dstv|gotv|electric|nepa/i.test(t)) {
    if (isOrderPhrase(text) || merged.bill_type || merged.meter || merged.amount) {
      action = 'pay_bill';
    }
    service = 'bills';
  }

  if (isWalletTopUpRequest(text)) {
    service = 'wallet';
    action = 'topup';
  } else if (/balance/i.test(t)) {
    service = 'wallet';
    action = 'balance';
  }

  intent.service = service;
  intent.action = action;
  intent.params = merged;
  return intent;
}

function regexOrderIntent(text) {
  if (!text || text.length < 3) return null;
  const t = text.trim();
  const params = extractOrderParams(t);

  if (/balance/i.test(t) && !isOrderPhrase(t)) {
    return { service: 'wallet', action: 'balance', params: {}, confidence: 'high' };
  }

  if (isAirtimeRequest(t, params)) {
    return {
      service: 'airtime',
      action: 'buy_airtime',
      params: { ...params, type: 'airtime' },
      confidence: 'high',
    };
  }

  if (isDataRequest(t, params)) {
    return {
      service: 'airtime',
      action: 'buy_data',
      params: { ...params, type: 'data' },
      confidence: 'high',
    };
  }

  if (isWalletTopUpRequest(t)) {
    return { service: 'wallet', action: 'topup', params, confidence: 'high' };
  }

  if (/electric|dstv|gotv|startimes|nepa|phcn|pay.*bill/i.test(t)) {
    return { service: 'bills', action: 'pay_bill', params, confidence: 'high' };
  }

  if (/loan|borrow|bnpl|pay later|mysogi credit|activate credit|credit limit/i.test(t)) {
    return { service: 'loans', action: 'open', params, confidence: 'medium' };
  }

  if (/partner|plumber|cleaning|salon/i.test(t)) {
    return { service: 'partners', action: 'open', params, confidence: 'medium' };
  }

  return null;
}

module.exports = {
  extractOrderParams,
  enrichIntent,
  regexOrderIntent,
  isAffirmation,
  isDenial,
  isOrderPhrase,
  isPurchaseIntent,
  isAirtimeRequest,
  isDataRequest,
  isWalletTopUpRequest,
  resolveProductType,
  resolveTelecomAction,
  normalizeNetwork,
};
