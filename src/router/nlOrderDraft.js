/**
 * Progressive NL orders — merge partial details and only ask for missing slots.
 */

const {
  extractOrderParams,
  normalizeNetwork,
  extractAmount,
  extractDataPlan,
  extractPhone,
  extractBillType,
  extractMeterAndProvider,
  regexOrderIntent,
  isDenial,
} = require('./nlOrderParser');

const NETWORKS = ['MTN', 'GLO', 'Airtel', '9mobile'];

function toLocalPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('234')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0')) return digits;
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

function stripEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v != null && v !== '') out[k] = v;
  }
  return out;
}

function createTelecomDraft(type, params, userPhone) {
  const action = type === 'data' ? 'buy_data' : 'buy_airtime';
  return {
    service: 'airtime',
    action,
    params: normalizeTelecomParams({ ...params, type }, userPhone),
    updatedAt: Date.now(),
  };
}

function createBillDraft(params) {
  return {
    service: 'bills',
    action: 'pay_bill',
    params: normalizeBillParams(params),
    updatedAt: Date.now(),
  };
}

function normalizeTelecomParams(params, userPhone) {
  const recipient = params.recipient === 'other' ? 'other' : 'self';
  const network = normalizeNetwork(params.network);
  const out = {
    type: params.type === 'data' ? 'data' : 'airtime',
    recipient,
    network: network && NETWORKS.includes(network) ? network : null,
    amount: params.amount != null ? Number(params.amount) : null,
    plan: params.plan || params.value || null,
    phone:
      recipient === 'other' && params.phone
        ? toLocalPhone(params.phone)
        : recipient === 'self'
          ? toLocalPhone(userPhone)
          : null,
  };
  return stripEmpty(out);
}

function normalizeBillParams(params) {
  const type = params.bill_type || params.type || null;
  const billMeter = extractMeterAndProvider(
    [params.meter, params.provider].filter(Boolean).join(', ')
  );
  return stripEmpty({
    bill_type: type,
    type,
    meter: params.meter || billMeter.meter || null,
    provider: params.provider || billMeter.provider || null,
    smartcard: params.smartcard || params.meter || null,
    amount: params.amount != null ? Number(params.amount) : null,
  });
}

function mergeDraft(draft, text, userPhone) {
  const local = extractOrderParams(text);
  const merged = { ...draft.params, ...stripEmpty(local) };

  if (draft.action === 'buy_airtime' || draft.action === 'buy_data') {
    const slot = parseTelecomSlot(text, draft);
    Object.assign(merged, stripEmpty(slot));
    return {
      ...draft,
      params: normalizeTelecomParams({ ...merged, type: draft.action === 'buy_data' ? 'data' : 'airtime' }, userPhone),
      updatedAt: Date.now(),
    };
  }

  if (draft.action === 'pay_bill') {
    const slot = parseBillSlot(text, draft);
    Object.assign(merged, stripEmpty(slot));
    return {
      ...draft,
      params: normalizeBillParams(merged),
      updatedAt: Date.now(),
    };
  }

  return draft;
}

function parseTelecomSlot(text, draft) {
  const missing = getMissingFields(draft);
  const field = missing[0];
  const t = String(text || '').trim();

  if (!field) return extractOrderParams(t);

  if (field === 'network') {
    const net = normalizeNetwork(t) || normalizeNetwork(t.split(/\s+/)[0]);
    if (net) return { network: net };
  }

  if (field === 'amount') {
    const amt = extractAmount(t, { minAmount: 20 }) || (/^\d{2,7}$/.test(t) ? Number(t) : null);
    if (amt) return { amount: amt };
  }

  if (field === 'plan') {
    const plan = extractDataPlan(t) || (t.length >= 2 ? t : null);
    if (plan) return { plan, value: plan };
  }

  if (field === 'phone') {
    const ph = extractPhone(t) || (/^0\d{10}$/.test(t.replace(/\s/g, '')) ? t.replace(/\s/g, '') : null);
    if (ph) return { phone: ph, recipient: 'other' };
  }

  return stripEmpty(extractOrderParams(t));
}

function parseBillSlot(text, draft) {
  const missing = getMissingFields(draft);
  const field = missing[0];
  const t = String(text || '').trim();

  if (field === 'bill_type') {
    const bt = extractBillType(t);
    if (bt) return { bill_type: bt, type: bt };
  }

  if (field === 'meter') {
    const billMeter = extractMeterAndProvider(t);
    if (draft.params.bill_type === 'electricity') {
      return stripEmpty({
        meter: billMeter.meter,
        provider: billMeter.provider,
      });
    }
    return { smartcard: billMeter.meter || t, meter: billMeter.meter || t };
  }

  if (field === 'amount') {
    const amt = extractAmount(t, { minAmount: 100 }) || (/^\d{3,7}$/.test(t) ? Number(t) : null);
    if (amt) return { amount: amt };
  }

  return stripEmpty(extractOrderParams(t));
}

function getMissingFields(draft) {
  const p = draft.params || {};
  const missing = [];

  if (draft.action === 'buy_airtime') {
    if (!p.network) missing.push('network');
    if (!p.amount) missing.push('amount');
    if (p.recipient === 'other' && !p.phone) missing.push('phone');
    return missing;
  }

  if (draft.action === 'buy_data') {
    if (!p.network) missing.push('network');
    if (!p.plan) missing.push('plan');
    if (p.recipient === 'other' && !p.phone) missing.push('phone');
    return missing;
  }

  if (draft.action === 'pay_bill') {
    if (!p.bill_type && !p.type) missing.push('bill_type');
    const billType = p.bill_type || p.type;
    if (billType === 'electricity') {
      if (!p.meter) missing.push('meter');
    } else if (billType) {
      if (!p.smartcard && !p.meter) missing.push('meter');
    }
    if (!p.amount) missing.push('amount');
    return missing;
  }

  return missing;
}

function summarizeDraft(draft) {
  const p = draft.params || {};
  const parts = [];

  if (draft.action === 'buy_airtime' || draft.action === 'buy_data') {
    if (p.network) parts.push(`Network: *${p.network}*`);
    if (draft.action === 'buy_data' && p.plan) parts.push(`Plan: *${p.plan}*`);
    if (p.amount) parts.push(`Amount: *₦${Number(p.amount).toLocaleString('en-NG')}*`);
    if (p.phone) parts.push(`Phone: *${p.phone}*`);
    else if (p.recipient === 'self') parts.push('For: *your number*');
  }

  if (draft.action === 'pay_bill') {
    const bt = p.bill_type || p.type;
    if (bt) parts.push(`Bill: *${bt}*`);
    if (p.meter) parts.push(`Meter: *${p.meter}*${p.provider ? ` (${p.provider})` : ''}`);
    if (p.smartcard) parts.push(`Smartcard: *${p.smartcard}*`);
    if (p.amount) parts.push(`Amount: *₦${Number(p.amount).toLocaleString('en-NG')}*`);
  }

  return parts.join('\n');
}

function promptForField(draft, field) {
  const p = draft.params || {};
  const known = summarizeDraft(draft);
  const header = known ? `${known}\n\n` : '';

  if (field === 'network') {
    return (
      `${header}Which network?\n\n` +
      `Reply: *MTN*, *GLO*, *Airtel*, or *9mobile*`
    );
  }
  if (field === 'amount') {
    const label = draft.action === 'buy_data' ? 'data plan' : 'airtime amount';
    return `${header}Enter ${label} in Naira (min ₦50):\n\n_e.g. 500_`;
  }
  if (field === 'plan') {
    return `${header}Enter data plan for *${p.network}*:\n\n_e.g. 1GB, 2GB, 5GB_`;
  }
  if (field === 'phone') {
    return `${header}Enter recipient phone number:\n\n_e.g. 08012345678_`;
  }
  if (field === 'bill_type') {
    return `${header}Which bill?\n\nReply: *DSTV*, *GOtv*, *StarTimes*, or *electricity*`;
  }
  if (field === 'meter') {
    if ((p.bill_type || p.type) === 'electricity') {
      return `${header}Send meter number and provider:\n\n_Example: 45012345678, IKEDC_`;
    }
    return `${header}Enter your *${(p.bill_type || p.type || '').toUpperCase()}* smartcard number:`;
  }

  return `${header}Please provide the missing detail.`;
}

function isNewOrderOverride(text, draft) {
  if (!draft) return false;
  const fresh = regexOrderIntent(text);
  if (!fresh) return false;
  if (fresh.action === 'balance' || fresh.action === 'menu') return true;
  if (fresh.service !== draft.service) return true;
  if (fresh.action !== draft.action) return true;
  return false;
}

function draftToAirtime(draft) {
  const p = draft.params;
  return {
    type: draft.action === 'buy_data' ? 'data' : 'airtime',
    network: p.network,
    amount: p.amount,
    phone: p.phone || null,
    recipientType: p.recipient === 'other' ? 'other' : 'self',
    value: p.plan || (p.amount != null ? String(p.amount) : undefined),
    plan: p.plan,
  };
}

function draftToBill(draft) {
  const p = draft.params;
  const type = p.bill_type || p.type;
  const bill = { type, amount: p.amount };
  if (type === 'electricity') {
    bill.meter = p.meter;
    bill.provider = (p.provider || 'IKEDC').toUpperCase();
  } else {
    bill.smartcard = p.smartcard || p.meter;
  }
  return bill;
}

module.exports = {
  NETWORKS,
  createTelecomDraft,
  createBillDraft,
  mergeDraft,
  getMissingFields,
  summarizeDraft,
  promptForField,
  isNewOrderOverride,
  isDenial,
  draftToAirtime,
  draftToBill,
  toLocalPhone,
};
