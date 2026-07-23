/**
 * WhatsApp reminders — events & recurring alerts.
 * Regex parsing + OpenAI fallback for natural language.
 */

const crypto = require('crypto');
const { getUser, setUser } = require('../userStore');
const { getSupabase, isSupabaseReady } = require('../db/supabase');
const { normalizePhone } = require('../utils/phone');
const config = require('../config');
const logger = require('../core/logger');

const MAX_REMINDERS = 30;
/** Africa/Lagos is UTC+1 year-round (no DST). */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

function lagosWallParts(now = new Date()) {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  return {
    year: lagos.getUTCFullYear(),
    month: lagos.getUTCMonth(), // 0-based
    day: lagos.getUTCDate(),
    hour: lagos.getUTCHours(),
    minute: lagos.getUTCMinutes(),
  };
}

/** Build a UTC Date from a Lagos wall-clock time. */
function fromLagosLocal(year, monthIndex, day, hour, minute) {
  return new Date(Date.UTC(year, monthIndex, day, hour - 1, minute || 0, 0, 0));
}

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

function extractTimeMatch(text) {
  const t = String(text || '');
  // 7:45pm, 7.45pm, 19:45, 8am, at 8, by 7:45 pm
  return (
    t.match(/(?:at|by|@)?\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?/i) ||
    t.match(/(?:at|by|@)?\s*(\d{1,2})\s*(am|pm)\b/i) ||
    t.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)\b/i) ||
    t.match(/\b(\d{1,2})\s*(am|pm)\b/i)
  );
}

/** Returns { hour, minute } in 24h Lagos local from a time match. */
function parseTimeParts(tm) {
  if (!tm) return { hour: 9, minute: 0 };
  const hRaw = Number(tm[1] || 9);
  let minutes = 0;
  let ampm = '';

  if (tm[2] != null && /^(am|pm)$/i.test(String(tm[2]))) {
    ampm = String(tm[2]).toLowerCase();
  } else if (tm[2] != null && tm[2] !== '') {
    minutes = Number(tm[2]) || 0;
    if (tm[3] && /^(am|pm)$/i.test(String(tm[3]))) ampm = String(tm[3]).toLowerCase();
  } else if (tm[3] && /^(am|pm)$/i.test(String(tm[3]))) {
    ampm = String(tm[3]).toLowerCase();
  }

  let h = hRaw;
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return { hour: h, minute: minutes };
}

function timePartsFromText(text) {
  return parseTimeParts(extractTimeMatch(text));
}

function normalizeReminderText(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bby\.?\s*/gi, 'by ')
    .replace(/\bat\.?\s*/gi, 'at ')
    .replace(/\beveryday\b/gi, 'every day')
    .replace(/\bevery\s*day\b/gi, 'every day')
    .replace(/\b(\d{1,2})\s*[.]\s*(\d{2})\s*(am|pm)\b/gi, '$1:$2$3');
}

function parseDateTime(text, now = new Date()) {
  let t = normalizeReminderText(text);
  const lower = t.toLowerCase();
  const wall = lagosWallParts(now);
  const { hour: th, minute: tm } = timePartsFromText(lower);

  if (/^tomorrow\b/i.test(lower)) {
    const base = fromLagosLocal(wall.year, wall.month, wall.day, th, tm);
    const d = new Date(base.getTime() + 24 * 60 * 60 * 1000);
    return { ok: true, date: d, frequency: 'once' };
  }

  if (/^today\b/i.test(lower)) {
    let d = fromLagosLocal(wall.year, wall.month, wall.day, th, tm);
    if (d.getTime() <= now.getTime()) {
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    }
    return { ok: true, date: d, frequency: 'once' };
  }

  // Time only → assume daily (e.g. "8am", "7:45pm")
  const timeOnly = lower.replace(/^(at|by|@)\s+/, '');
  if (/^\d{1,2}([:.]\d{2})?\s*(am|pm)?$/i.test(timeOnly)) {
    let d = fromLagosLocal(wall.year, wall.month, wall.day, th, tm);
    if (d.getTime() <= now.getTime()) d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    return { ok: true, date: d, frequency: 'daily' };
  }

  if (/\b(every\s+day|daily)\b/i.test(lower)) {
    let d = fromLagosLocal(wall.year, wall.month, wall.day, th, tm);
    if (d.getTime() <= now.getTime()) d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    return { ok: true, date: d, frequency: 'daily' };
  }

  if (/\b(every\s+week|weekly)\b/i.test(lower)) {
    let d = fromLagosLocal(wall.year, wall.month, wall.day, th, tm);
    d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { ok: true, date: d, frequency: 'weekly' };
  }

  if (/\b(every\s+year|yearly|annually)\b/i.test(lower)) {
    const m = t.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
    if (!m) return { ok: false, message: 'For yearly reminders use e.g. *25/12 every year*' };
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let d = fromLagosLocal(wall.year, month, day, th, tm);
    if (d.getTime() <= now.getTime()) {
      d = fromLagosLocal(wall.year + 1, month, day, th, tm);
    }
    return { ok: true, date: d, frequency: 'yearly' };
  }

  const m = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const d = fromLagosLocal(year, month, day, th, tm);
    if (Number.isNaN(d.getTime())) return { ok: false, message: 'Invalid date.' };
    return { ok: true, date: d, frequency: 'once' };
  }

  const m2 = t.match(/(\d{1,2})[\/\-.](\d{1,2})\b/);
  if (m2) {
    const day = Number(m2[1]);
    const month = Number(m2[2]) - 1;
    let d = fromLagosLocal(wall.year, month, day, th, tm);
    if (d.getTime() <= now.getTime()) {
      d = fromLagosLocal(wall.year + 1, month, day, th, tm);
    }
    return { ok: true, date: d, frequency: 'once' };
  }

  return {
    ok: false,
    message:
      'I could not read that date/time.\n\nTry:\n' +
      '• *remind me drink water every day at 8am*\n' +
      '• *remind me Pay rent on 28/07/2026*\n' +
      '• *remind me Call Mama tomorrow at 5pm*',
  };
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
    `Say: *remind me Call Mama tomorrow 5pm*\n` +
    `List: *my reminders*`
  );
}

function looksLikeReminder(text) {
  const t = String(text || '')
    .trim()
    .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+\s*/u, '');
  if (!t) return false;
  // Ignore long menu paste / guest banner (list-row echo)
  if (t.length > 180 && /guest mode|pay with paystack|or tap a service/i.test(t)) {
    return false;
  }
  if (/^(my reminders|list reminders|show reminders|reminders?|reminders?\s+help)$/i.test(t)) {
    return true;
  }
  if (/^(?:delete|remove|cancel)\s+reminder\b/i.test(t)) return true;
  if (/^(?:add\s+)?reminder\b/i.test(t)) return true;
  if (/\bremind(?:\s+me)?\b/i.test(t)) return true;
  if (/\bset\s+a?\s*reminder\b/i.test(t)) return true;
  return false;
}

function cleanTitle(title) {
  return String(title || '')
    .replace(/^(to|that|me\s+to)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip schedule words so title is just the thing to remember */
function stripScheduleFromTitle(title) {
  return cleanTitle(title)
    .replace(
      /\s+(?:on|at|by|for|every\s+day|everyday|daily|every\s+week|weekly|every\s+year|yearly|tomorrow|today)\b.*$/i,
      ''
    )
    .replace(/\s+\d{1,2}([:.]\d{2})?\s*(am|pm)?\s*$/i, '')
    .replace(/\s+\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\s*$/i, '')
    .trim();
}

function parseReminderCommand(text) {
  let t = normalizeReminderText(text).replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+\s*/u, '');

  if (/^(my reminders|list reminders|show reminders|reminders)$/i.test(t)) {
    return { action: 'list' };
  }
  if (/^reminders?\s+help$/i.test(t)) {
    return { action: 'help' };
  }

  const del = t.match(/^(?:delete|remove|cancel)\s+reminder\s+(.+)$/i);
  if (del) return { action: 'delete', query: del[1].trim() };

  // Strip leading remind me / remind me to / set a reminder to
  const stripped = t
    .replace(/^(?:please\s+)?(?:set\s+a?\s*)?remind(?:er)?(?:\s+me)?(?:\s+to)?\s+/i, '')
    .replace(/^add\s+reminder(?:\s+to)?\s+/i, '')
    .trim();

  const body = stripped && stripped.length >= 2 ? stripped : t;

  // TITLE + every day / everyday / daily + optional time
  const daily = body.match(
    /^(.+?)\s+(every\s+day|everyday|daily)(?:\s+(?:at|by|@)\s*(.+))?$/i
  );
  if (daily) {
    const whenText = `every day ${daily[3] ? `at ${daily[3]}` : 'at 9am'}`.trim();
    return { action: 'add', title: cleanTitle(daily[1]), whenText };
  }

  // TITLE + every week
  const weekly = body.match(/^(.+?)\s+(every\s+week|weekly)(?:\s+(?:at|by|@)\s*(.+))?$/i);
  if (weekly) {
    return {
      action: 'add',
      title: cleanTitle(weekly[1]),
      whenText: `every week ${weekly[3] ? `at ${weekly[3]}` : 'at 9am'}`,
    };
  }

  // TITLE tomorrow/today ... (must run BEFORE generic "at/by" or "at 5pm" steals it)
  const near = body.match(/^(.+?)\s+(tomorrow|today)(?:\s+(?:at|by|@)\s*(.+))?$/i);
  if (near) {
    const whenText = near[3]
      ? `${near[2]} at ${near[3]}`.trim()
      : `${near[2]}${''}`.trim();
    return {
      action: 'add',
      title: cleanTitle(near[1]),
      whenText: whenText || near[2],
    };
  }

  // TITLE on/at/by DATE — do NOT use "for" here (steals "buy airtime for Mama")
  const dated = body.match(/^(.+?)\s+(?:on|at|by)\s+(.+)$/i);
  if (dated && !/^(every|daily|weekly|tomorrow|today)/i.test(dated[2])) {
    const whenPart = dated[2].trim();
    const titlePart = cleanTitle(dated[1]);
    // Skip VTU / bill purchase titles (not "Pay rent")
    if (/\b(airtime|data|electricity|dstv|gotv|wallet)\b/i.test(titlePart)) {
      /* fall through */
    } else if (/^(?:buy|purchase|get|send|fund|top\s*up)\b/i.test(titlePart) && !/\brent\b/i.test(titlePart)) {
      /* fall through — e.g. "buy for Mama" without remind cue handled by looksLike gate */
    } else if (/^(?:\d{1,2}([:.]\d{2})?\s*(am|pm)?)$/i.test(whenPart)) {
      return { action: 'add', title: titlePart, whenText: `every day at ${whenPart}` };
    } else {
      return { action: 'add', title: titlePart, whenText: whenPart };
    }
  }

  // TITLE + DD/MM...
  const slash = body.match(/^(.+?)\s+(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?.*)$/i);
  if (slash) {
    return { action: 'add', title: cleanTitle(slash[1]), whenText: slash[2].trim() };
  }

  // Fallback: whole body after remind me — let AI / parseDateTime try
  if (/\bremind/i.test(t) && body.length >= 3) {
    return { action: 'add', title: cleanTitle(body), whenText: body, needsAi: true };
  }

  return null;
}

/**
 * Use OpenAI to understand free-form reminder language (Lagos timezone).
 */
async function interpretReminderWithAI(text) {
  if (!config.openai?.apiKey) return null;

  try {
    const ai = require('../providers/openai');
    const now = new Date();
    const lagosNow = now.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });

    const response = await ai.chat({
      model: config.openai.model,
      temperature: 0,
      max_tokens: 250,
      messages: [
        {
          role: 'system',
          content:
            `You extract WhatsApp reminder intents for Nigeria (Africa/Lagos).\n` +
            `Current Lagos time: ${lagosNow}\n` +
            `Reply ONLY JSON:\n` +
            `{"ok":true,"title":"short title","frequency":"once|daily|weekly|yearly","hour":0-23,"minute":0-59,"day":null|1-31,"month":null|1-12,"year":null|YYYY}\n` +
            `or {"ok":false,"reason":"..."}\n` +
            `Rules: title is the thing to remember (no date words). ` +
            `everyday/daily → frequency daily. ` +
            `If only a time is given with remind me, use daily. ` +
            `hour/minute in 24h Lagos local.`,
        },
        { role: 'user', content: String(text).slice(0, 400) },
      ],
    });

    const raw = (response.text || '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed?.ok || !parsed.title) return null;

    const frequency = ['once', 'daily', 'weekly', 'yearly'].includes(parsed.frequency)
      ? parsed.frequency
      : 'once';
    const hour = Number(parsed.hour);
    const minute = Number(parsed.minute);
    const h = Number.isFinite(hour) ? hour : 9;
    const m = Number.isFinite(minute) ? minute : 0;
    const wall = lagosWallParts(now);

    let date;
    if (frequency === 'once' && parsed.day && parsed.month) {
      const year = parsed.year || wall.year;
      date = fromLagosLocal(year, Number(parsed.month) - 1, Number(parsed.day), h, m);
      if (date.getTime() <= now.getTime() && !parsed.year) {
        date = fromLagosLocal(year + 1, Number(parsed.month) - 1, Number(parsed.day), h, m);
      }
    } else if (frequency === 'yearly' && parsed.day && parsed.month) {
      date = fromLagosLocal(wall.year, Number(parsed.month) - 1, Number(parsed.day), h, m);
      if (date.getTime() <= now.getTime()) {
        date = fromLagosLocal(wall.year + 1, Number(parsed.month) - 1, Number(parsed.day), h, m);
      }
    } else if (frequency === 'weekly') {
      date = fromLagosLocal(wall.year, wall.month, wall.day, h, m);
      date = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else {
      // daily or default
      date = fromLagosLocal(wall.year, wall.month, wall.day, h, m);
      if (date.getTime() <= now.getTime()) {
        date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    return {
      ok: true,
      title: cleanTitle(parsed.title).slice(0, 80),
      frequency: frequency === 'once' && !parsed.day ? 'daily' : frequency,
      date,
    };
  } catch (err) {
    logger.warn('AI reminder parse failed', { error: err.message });
    return null;
  }
}

async function addReminder(phone, { title, whenText, date, frequency }) {
  const norm = normalizePhone(phone);
  let resolvedDate = date || null;
  let resolvedFreq = frequency || 'once';

  if (!resolvedDate && whenText) {
    const parsed = parseDateTime(whenText);
    if (parsed.ok) {
      resolvedDate = parsed.date;
      resolvedFreq = parsed.frequency || 'once';
    }
  }

  if (!resolvedDate) {
    return { ok: false, message: parseDateTime('').message };
  }

  let clean = stripScheduleFromTitle(title);
  if (!clean || clean.length < 2) clean = cleanTitle(title);
  if (!clean || clean.length < 2) {
    return { ok: false, message: 'Give your reminder a short title.' };
  }

  const reminders = listLocal(norm);
  if (reminders.length >= MAX_REMINDERS) {
    return { ok: false, message: `Limit is ${MAX_REMINDERS} reminders. Delete some first.` };
  }

  const item = {
    id: `rem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    title: String(clean).slice(0, 80),
    remindAt: resolvedDate.toISOString(),
    frequency: resolvedFreq,
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
  const baseLagos = new Date(base.getTime() + LAGOS_OFFSET_MS);
  const h = baseLagos.getUTCHours();
  const mi = baseLagos.getUTCMinutes();
  const wall = lagosWallParts(from);

  if (item.frequency === 'daily') {
    let d = fromLagosLocal(wall.year, wall.month, wall.day, h, mi);
    if (d.getTime() <= from.getTime()) d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    return d;
  }
  if (item.frequency === 'weekly') {
    let d = fromLagosLocal(wall.year, wall.month, wall.day, h, mi);
    d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
    return d;
  }
  if (item.frequency === 'yearly') {
    const month = baseLagos.getUTCMonth();
    const day = baseLagos.getUTCDate();
    let d = fromLagosLocal(wall.year + 1, month, day, h, mi);
    return d;
  }
  return null;
}

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
  looksLikeReminder,
  interpretReminderWithAI,
  addReminder,
  deleteReminder,
  listReminders,
  remindersHelp,
  formatWhen,
  getDueReminders,
  markReminderSent,
  nextFire,
  cleanTitle,
  stripScheduleFromTitle,
  normalizeReminderText,
};
