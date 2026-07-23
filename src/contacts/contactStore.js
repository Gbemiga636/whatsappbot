/**
 * Per-user saved contacts — for "buy airtime for Mama" style orders.
 * WhatsApp bots cannot read the phone's contact list; users save or share contacts here.
 */

const { getUser, setUser } = require('../userStore');
const { normalizePhone, formatPhoneDisplay } = require('../utils/phone');

const MAX_CONTACTS = 200;

function toLocalPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('234')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0')) return digits;
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

function normalizeNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getContactsMap(user) {
  return user?.metadata?.contacts || {};
}

async function listContacts(ownerPhone) {
  const user = getUser(ownerPhone);
  const map = getContactsMap(user);
  return Object.values(map).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function saveContact(ownerPhone, { name, phone }) {
  const local = toLocalPhone(phone);
  if (!name || local.length < 11) {
    return { ok: false, message: 'Valid name and 11-digit Nigerian number required.' };
  }

  const user = getUser(ownerPhone) || { phone: normalizePhone(ownerPhone) };
  const contacts = { ...getContactsMap(user) };
  const key = normalizeNameKey(name);

  if (!contacts[key] && Object.keys(contacts).length >= MAX_CONTACTS) {
    return { ok: false, message: `Contact limit (${MAX_CONTACTS}) reached. Delete old ones first.` };
  }

  contacts[key] = {
    name: String(name).trim(),
    phone: local,
    savedAt: new Date().toISOString(),
  };

  setUser(ownerPhone, {
    metadata: { ...(user.metadata || {}), contacts },
  });

  return { ok: true, contact: contacts[key] };
}

async function deleteContact(ownerPhone, nameKey) {
  const user = getUser(ownerPhone);
  const contacts = { ...getContactsMap(user) };
  const key = normalizeNameKey(nameKey);
  if (!contacts[key]) return { ok: false, message: 'Contact not found.' };
  const removed = contacts[key];
  delete contacts[key];
  setUser(ownerPhone, { metadata: { ...(user.metadata || {}), contacts } });
  return { ok: true, contact: removed };
}

async function updateContact(ownerPhone, nameKey, { phone, newName }) {
  const user = getUser(ownerPhone);
  const contacts = { ...getContactsMap(user) };
  const key = normalizeNameKey(nameKey);
  const existing = contacts[key];
  if (!existing) return { ok: false, message: `No contact named *${nameKey}*.` };

  const nextPhone = phone ? toLocalPhone(phone) : existing.phone;
  const nextName = (newName || existing.name).trim();
  if (!nextName || nextPhone.length < 11) {
    return { ok: false, message: 'Valid name and 11-digit number required.' };
  }

  const nextKey = normalizeNameKey(nextName);
  if (nextKey !== key) delete contacts[key];

  contacts[nextKey] = {
    name: nextName,
    phone: nextPhone,
    savedAt: existing.savedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  setUser(ownerPhone, { metadata: { ...(user.metadata || {}), contacts } });
  return { ok: true, contact: contacts[nextKey] };
}

function getContactByKey(ownerPhone, nameKey) {
  const user = getUser(ownerPhone);
  return getContactsMap(user)[normalizeNameKey(nameKey)] || null;
}

function findContactMatches(contactsMap, query) {
  const q = normalizeNameKey(query);
  if (!q) return [];

  const entries = Object.entries(contactsMap);
  const exact = entries.filter(([k]) => k === q);
  if (exact.length) {
    return exact.map(([, v]) => v);
  }

  return entries
    .filter(([k, v]) => k.includes(q) || q.includes(k) || String(v.name || '').toLowerCase().includes(q))
    .map(([, v]) => v);
}

async function resolveContactName(ownerPhone, name) {
  const user = getUser(ownerPhone);
  const matches = findContactMatches(getContactsMap(user), name);
  if (matches.length === 1) return { ok: true, contact: matches[0] };
  if (matches.length > 1) {
    return { ok: false, ambiguous: true, matches, message: `Multiple contacts match *${name}*.` };
  }
  return { ok: false, message: `No saved contact for *${name}*. Share their contact card or save them first.` };
}

async function resolveContactNames(ownerPhone, names) {
  const resolved = [];
  const ambiguous = [];
  const missing = [];

  for (const raw of names) {
    const result = await resolveContactName(ownerPhone, raw);
    if (result.ok) resolved.push(result.contact);
    else if (result.ambiguous) ambiguous.push({ query: raw, matches: result.matches });
    else missing.push(raw);
  }

  return { resolved, ambiguous, missing };
}

function parseSharedContacts(message) {
  const list = message?.contacts || [];
  const out = [];

  for (const c of list) {
    const name =
      c.name?.formatted_name ||
      [c.name?.first_name, c.name?.last_name].filter(Boolean).join(' ') ||
      'Contact';
    const phones = c.phones || [];
    for (const p of phones) {
      const local = toLocalPhone(p.phone || p.wa_id || '');
      if (local.length >= 11) {
        out.push({ name: name.trim(), phone: local });
        break;
      }
    }
  }

  return out;
}

function extractPhonesFromText(text) {
  const phones = [];
  const re = /\b(234\d{10}|0\d{10})\b/g;
  let m;
  const t = String(text || '');
  while ((m = re.exec(t))) {
    phones.push(toLocalPhone(m[1]));
  }
  return [...new Set(phones.filter((p) => p.length >= 11))];
}

function extractRecipientNames(text) {
  const t = String(text || '');
  const patterns = [
    /\b(?:send|buy|get|recharge|load)\s+(?:\w+\s+){0,3}(?:airtime|data|credit)\s+(?:to|for)\s+([a-zA-Z][\w\s,'&-]+?)$/i,
    /\b(?:for|to)\s+([a-zA-Z][\w\s,'&-]+?)(?:\s+(?:on|with|using|each|worth|@)?\s*(?:mtn|glo|airtel|9mobile|etisalat|airtime|data|credit|recharge|\d|₦|ngn)|$)/i,
  ];
  let match = null;
  for (const p of patterns) {
    match = t.match(p);
    if (match) break;
  }
  if (!match) return [];

  return match[1]
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter((s) => s.length >= 2 && !/^\d+$/.test(s) && !/^(mtn|glo|airtel|9mobile)$/i.test(s));
}

function parseRecipientsFromText(text, ownerPhone) {
  const phones = extractPhonesFromText(text);
  const names = extractRecipientNames(text);
  return { phones, names };
}

function formatContactLine(c) {
  return `*${c.name}* — ${formatPhoneDisplay(c.phone)}`;
}

function contactsHelpText() {
  return (
    `📇 *Contacts*\n\n` +
    `Save: \`save contact Mama 080…\`\n` +
    `Or share a contact card.\n\n` +
    `Then: *500 airtime for Mama*`
  );
}

module.exports = {
  toLocalPhone,
  listContacts,
  saveContact,
  deleteContact,
  updateContact,
  getContactByKey,
  resolveContactName,
  resolveContactNames,
  findContactMatches,
  parseSharedContacts,
  extractPhonesFromText,
  extractRecipientNames,
  parseRecipientsFromText,
  formatContactLine,
  contactsHelpText,
  normalizeNameKey,
};
