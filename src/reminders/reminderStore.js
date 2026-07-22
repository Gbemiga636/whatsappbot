/**
 * WhatsApp reminders — events & recurring alerts.
 * Stored in user.metadata.reminders (and optional Supabase table).
 */

const crypto = require('crypto');
const { getUser, setUser } = require('../userStore');
const { getSupabase, isSupabaseReady } = require('../db/supabase');
const { normalizePhone } = require('../utils/phone');
const logger = require('../core/logger');

const MAX_REMINDERS = 30;

function listLocal(phone) {
  const user = getUser(phone);
  return Array.isArray(user?.metadata?.reminders) ? [...user.metadata.reminders] : [];
}

function saveLocal(phone, reminders) {
  const user = getUser(phone) || {};
  setUser(phone, {
    metadata: { ...(user.metadata || {}), reminders },
  });
}

function parseDateTime(text, now = new Date()) {
  const t = String(text || '').trim();
  const lower = t.toLowerCase();

  // tomorrow [at HH:MM]
  if (/^tomorrow\b/i.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    const tm = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    applyTime(d, tm);
    return { ok: true, date: d, frequency: 'once' };
  }

  // today at HH:MM
  if (/^today\b/i.test(lower)) {
    const d = new Date(now);
    const tm = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    applyTime(d, tm);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return { ok: true, date: d, frequency: 'once' };
  }

  // every day / daily [at HH:MM]
  if (/\b(every\s+day|daily)\b/i.test(lower)) {
    const d = new Date(now);
    const tm = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    applyTime(d, tm || ['', '9', '00']);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return { ok: true, date: d, frequency: 'daily' };
  }

  // every week / weekly
  if (/\b(every\s+week|weekly)\b/i.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    const tm = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    applyTime(d, tm || ['', '9', '00']);
    return { ok: true, date: d, frequency: 'weekly' };
  }

  // yearly / every year / birthday style
  if (/\b(every\s+year|yearly|annually)\b/i.test(lower)) {
    const m = t.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
    if (!m) return { ok: false, message: 'For yearly reminders use e.g. *25/12 every year*' };
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let d = new Date(now.getFullYear(), month, day, 9, 0, 0);
    if (d.getTime() <= now.getTime()) d = new Date(now.getFullYear() + 1, month, day, 9, 0, 0);
    return { ok: true, date: d, frequency: 'yearly' };
  }

  // DD/MM/YYYY or DD-MM-YYYY [at HH:MM]
  const m = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const d = new Date(year, month, day, 9, 0, 0);
    if (m[4]) applyTime(d, ['', m[4], m[5] || '0', m[6]]);
    if (Number.isNaN(d.getTime())) return { ok: false, message: 'Invalid date.' };
    return { ok: true, date: d, frequency: 'once' };
  }

  // DD/MM (assume this year or next)
  const m2 = t.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/i);
  if (m2) {
    const day = Number(m2[1]);
    const month = Number(m2[2]) - 1;
    let d = new Date(now.getFullYear(), month, day, 9, 0, 0);
    if (m2[3]) applyTime(d, ['', m2[3], m2[4] || '0', m2[5]]);
    if (d.getTime() <= now.getTime()) d = new Date(now.getFullYear() + 1, month, day, d.getHours(), d.getMinutes());
    return { ok: true, date: d, frequency: 'once' };
  }

  return {
    ok: false,
    message:
      'Date format examples:\n' +
      '• *28/07/2026*\n' +
      '• *tomorrow at 9am*\n' +
      '• *every day at 8am*\n' +
      '• *25/12 every year*',
  };
}

function applyTime(date, tm) {
  if (!tm) {
    date.setHours(9, 0, 0, 0);
    return;
  }
  let h = Number(tm[1] || 9);
  const min = Number(tm[2] || 0);
  const ampm = (tm[3] || '').toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  date.setHours(h, min, 0, 0);
}

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function remindersHelp() {
  return (
    `🔔 *Reminders*\n\n` +
    `*Add one:*\n` +
    `remind me Pay rent on 28/07/2026\n` +
    `remind me Call Mama tomorrow at 5pm\n` +
    `remind me Drink water every day at 8am\n` +
    `remind me Birthday Ada on 25/12 every year\n\n` +
    `*Manage:*\n` +
    `• *my reminders* — list\n` +
    `• *delete reminder Pay rent* — remove\n\n` +
    `_We'll message you on WhatsApp when it's time._`
  );
}

function parseReminderCommand(text) {
  const t = String(text || '').trim();

  if (/^(my reminders|list reminders|show reminders|reminders)$/i.test(t)) {
    return { action: 'list' };
  }
  if (/^reminders?\s+help$/i.test(t)) {
    return { action: 'help' };
  }

  const del = t.match(/^(?:delete|remove|cancel)\s+reminder\s+(.+)$/i);
  if (del) return { action: 'delete', query: del[1].trim() };

  // remind me TITLE on/at/every DATE...
  const add =
    t.match(/^remind(?:\s+me)?\s+(.+?)\s+(?:on|at|by)\s+(.+)$/i) ||
    t.match(/^remind(?:\s+me)?\s+(.+?)\s+(tomorrow(?:\s+at\s+.+)?)$/i) ||
    t.match(/^remind(?:\s+me)?\s+(.+?)\s+(today(?:\s+at\s+.+)?)$/i) ||
    t.match(/^remind(?:\s+me)?\s+(.+?)\s+(every\s+.+)$/i) ||
    t.match(/^(?:add\s+)?reminder\s+(.+?)\s+(?:on|at|by)\s+(.+)$/i);

  if (add) {
    return { action: 'add', title: add[1].trim(), whenText: add[2].trim() };
  }

  // remind me TITLE every day at ...
  const add2 = t.match(/^remind(?:\s+me)?\s+(.+)$/i);
  if (add2 && /\b(tomorrow|today|every|daily|weekly|\d{1,2}[\/\-.]\d{1,2})/i.test(add2[1])) {
    const body = add2[1].trim();
    const split = body.match(/^(.+?)\s+((?:tomorrow|today|every\s+.+|\d{1,2}[\/\-.].+))$/i);
    if (split) return { action: 'add', title: split[1].trim(), whenText: split[2].trim() };
  }

  return null;
}

async function addReminder(phone, { title, whenText }) {
  const norm = normalizePhone(phone);
  const parsed = parseDateTime(whenText);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  if (!title || title.length < 2) return { ok: false, message: 'Give your reminder a short title.' };

  const reminders = listLocal(norm);
  if (reminders.length >= MAX_REMINDERS) {
    return { ok: false, message: `Limit is ${MAX_REMINDERS} reminders. Delete some first.` };
  }

  const item = {
    id: `rem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    title: title.slice(0, 80),
    remindAt: parsed.date.toISOString(),
    frequency: parsed.frequency || 'once',
    enabled: true,
    createdAt: new Date().toISOString(),
    lastSentAt: null,
  };

  reminders.push(item);
  saveLocal(norm, reminders);
  await upsertDbReminder(norm, item);

  return { ok: true, reminder: item };
}

async function deleteReminder(phone, query) {
  const norm = normalizePhone(phone);
  const reminders = listLocal(norm);
  const q = String(query || '').toLowerCase();
  const idx = reminders.findIndex(
    (r) => r.id === query || r.title.toLowerCase() === q || r.title.toLowerCase().includes(q)
  );
  if (idx < 0) return { ok: false, message: `No reminder matching *${query}*.` };
  const [removed] = reminders.splice(idx, 1);
  saveLocal(norm, reminders);
  await deleteDbReminder(removed.id);
  return { ok: true, reminder: removed };
}

async function listReminders(phone) {
  return listLocal(normalizePhone(phone)).sort((a, b) => String(a.remindAt).localeCompare(String(b.remindAt)));
}

async function upsertDbReminder(phone, item) {
  try {
    if (!isSupabaseReady()) return;
    const db = getSupabase();
    if (!db) return;
    await db.from('reminders').upsert({
      id: item.id,
      phone,
      title: item.title,
      remind_at: item.remindAt,
      frequency: item.frequency,
      enabled: item.enabled,
      last_sent_at: item.lastSentAt,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn('Reminder DB upsert skipped', { message: err.message });
  }
}

async function deleteDbReminder(id) {
  try {
    if (!isSupabaseReady()) return;
    const db = getSupabase();
    if (!db) return;
    await db.from('reminders').delete().eq('id', id);
  } catch (err) {
    logger.warn('Reminder DB delete skipped', { message: err.message });
  }
}

function nextFire(item, from = new Date()) {
  const base = new Date(item.remindAt);
  if (item.frequency === 'once') return null;
  const d = new Date(from);
  if (item.frequency === 'daily') {
    d.setTime(from.getTime());
    d.setHours(base.getHours(), base.getMinutes(), 0, 0);
    if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  if (item.frequency === 'weekly') {
    d.setTime(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    d.setHours(base.getHours(), base.getMinutes(), 0, 0);
    return d;
  }
  if (item.frequency === 'yearly') {
    return new Date(from.getFullYear() + 1, base.getMonth(), base.getDate(), base.getHours(), base.getMinutes());
  }
  return null;
}

/**
 * Find due reminders from local metadata + optional DB.
 * Returns [{ phone, reminder }]
 */
async function getDueReminders(now = new Date()) {
  const due = [];

  try {
    if (isSupabaseReady()) {
      const db = getSupabase();
      if (db) {
        const { data, error } = await db
          .from('reminders')
          .select('*')
          .eq('enabled', true)
          .lte('remind_at', now.toISOString())
          .limit(100);
        if (!error && data?.length) {
          for (const row of data) {
            due.push({
              phone: row.phone,
              reminder: {
                id: row.id,
                title: row.title,
                remindAt: row.remind_at,
                frequency: row.frequency,
                enabled: row.enabled,
                lastSentAt: row.last_sent_at,
              },
              fromDb: true,
            });
          }
          return due;
        }
      }
    }
  } catch (err) {
    logger.warn('Reminder DB query failed', { message: err.message });
  }

  // Fallback: scan in-memory users (local/dev)
  try {
    const { getAllUsers } = require('../userStore');
    if (typeof getAllUsers === 'function') {
      for (const u of getAllUsers()) {
        const rem = u.metadata?.reminders || [];
        for (const r of rem) {
          if (r.enabled !== false && new Date(r.remindAt).getTime() <= now.getTime()) {
            due.push({ phone: u.phone, reminder: r, fromDb: false });
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  return due;
}

async function markReminderSent(phone, reminder, now = new Date()) {
  const norm = normalizePhone(phone);
  const reminders = listLocal(norm);
  const idx = reminders.findIndex((r) => r.id === reminder.id);
  const nxt = nextFire(reminder, now);

  if (idx >= 0) {
    if (!nxt || reminder.frequency === 'once') {
      reminders.splice(idx, 1);
    } else {
      reminders[idx] = {
        ...reminders[idx],
        lastSentAt: now.toISOString(),
        remindAt: nxt.toISOString(),
      };
    }
    saveLocal(norm, reminders);
  }

  try {
    if (isSupabaseReady()) {
      const db = getSupabase();
      if (db) {
        if (!nxt || reminder.frequency === 'once') {
          await db.from('reminders').delete().eq('id', reminder.id);
        } else {
          await db
            .from('reminders')
            .update({
              last_sent_at: now.toISOString(),
              remind_at: nxt.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', reminder.id);
        }
      }
    }
  } catch (err) {
    logger.warn('Reminder mark sent DB failed', { message: err.message });
  }
}

module.exports = {
  parseReminderCommand,
  parseDateTime,
  addReminder,
  deleteReminder,
  listReminders,
  remindersHelp,
  formatWhen,
  getDueReminders,
  markReminderSent,
  nextFire,
};
