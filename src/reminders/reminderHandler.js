/**
 * Reminder chat commands + menu entry.
 * Always handles reminder-like text (never fall through to AI/top-up loops).
 */

const whatsapp = require('../whatsapp');
const reminderStore = require('./reminderStore');
const { getSession, setSession } = require('../sessionStore');

function clearConflictingSession(phone) {
  const session = getSession(phone);
  if (!session) return;
  // Reminder commands interrupt any wizard (wallet top-up was looping guests)
  setSession(phone, {
    ...session,
    activeService: null,
    step: 'super_menu',
    data: { ...(session.data || {}), nlDraft: null },
  });
}

async function saveAndConfirm(phone, { title, whenText, date, frequency }) {
  const result = await reminderStore.addReminder(phone, { title, whenText, date, frequency });
  if (!result.ok) return result;
  const r = result.reminder;
  await whatsapp.sendText(
    phone,
    `✅ *Reminder set*\n*${r.title}*\n${reminderStore.formatWhen(r.remindAt)}` +
      (r.frequency !== 'once' ? ` · *${r.frequency}*` : '')
  );
  return result;
}

async function handleReminderCommand(phone, text) {
  const raw = String(text || '').trim();
  if (!raw) return false;

  const looksLike = reminderStore.looksLikeReminder(raw);
  let cmd = reminderStore.parseReminderCommand(raw);

  // Soft match: if it looks like a reminder but regex missed, force AI path
  if (!cmd && looksLike) {
    cmd = { action: 'add', title: raw, whenText: raw, needsAi: true };
  }
  if (!cmd) return false;

  // Critical: "Buy airtime for Mama" matches a loose "TITLE for X" pattern — never
  // treat that as a reminder unless the user actually said remind / reminder.
  if (cmd.action === 'add' && !looksLike) {
    return false;
  }

  clearConflictingSession(phone);

  if (cmd.action === 'help') {
    await whatsapp.sendText(phone, reminderStore.remindersHelp());
    return true;
  }

  if (cmd.action === 'list') {
    const list = await reminderStore.listReminders(phone);
    if (!list.length) {
      await whatsapp.sendText(phone, `🔔 *No reminders yet*\n\n${reminderStore.remindersHelp()}`);
      return true;
    }
    const lines = list
      .map(
        (r, i) =>
          `${i + 1}. *${r.title}*\n   ${reminderStore.formatWhen(r.remindAt)}` +
          (r.frequency && r.frequency !== 'once' ? ` · _${r.frequency}_` : '')
      )
      .join('\n\n');
    await whatsapp.sendText(
      phone,
      `🔔 *Your reminders (${list.length})*\n\n${lines}\n\n_Delete: *delete reminder Title*_`
    );
    return true;
  }

  if (cmd.action === 'delete') {
    const result = await reminderStore.deleteReminder(phone, cmd.query);
    await whatsapp.sendText(
      phone,
      result.ok ? `✅ Removed reminder *${result.reminder.title}*.` : `❌ ${result.message}`
    );
    return true;
  }

  if (cmd.action === 'add') {
    // 1) Always try structured parse first (even if needsAi flagged)
    const direct = await reminderStore.addReminder(phone, {
      title: cmd.title,
      whenText: cmd.whenText,
    });
    if (direct.ok) {
      const r = direct.reminder;
      await whatsapp.sendText(
        phone,
        `✅ *Reminder set*\n\n` +
          `*${r.title}*\n` +
          `${reminderStore.formatWhen(r.remindAt)}` +
          (r.frequency !== 'once' ? `\nRepeats: *${r.frequency}*` : '') +
          `\n\n_We'll message you here on WhatsApp._`
      );
      return true;
    }

    // 2) OpenAI understands free-form phrasing
    const ai = await reminderStore.interpretReminderWithAI(raw);
    if (ai?.ok) {
      const saved = await saveAndConfirm(phone, {
        title: ai.title,
        date: ai.date,
        frequency: ai.frequency,
      });
      if (saved?.ok) return true;
    }

    // 3) Last attempt: AI on title+when if we had parts
    if (cmd.title && cmd.whenText && cmd.whenText !== raw) {
      const ai2 = await reminderStore.interpretReminderWithAI(
        `Remind me ${cmd.title} ${cmd.whenText}`
      );
      if (ai2?.ok) {
        const saved = await saveAndConfirm(phone, {
          title: ai2.title,
          date: ai2.date,
          frequency: ai2.frequency,
        });
        if (saved?.ok) return true;
      }
    }

    await whatsapp.sendText(
      phone,
      `❌ I couldn't set that reminder.\n\n${reminderStore.remindersHelp()}`
    );
    return true;
  }

  return false;
}

async function showRemindersMenu(phone) {
  clearConflictingSession(phone);
  await whatsapp.sendText(phone, reminderStore.remindersHelp());
}

async function dispatchDueReminders() {
  const due = await reminderStore.getDueReminders(new Date());
  let sent = 0;
  for (const { phone, reminder } of due) {
    try {
      await whatsapp.sendText(
        phone,
        `🔔 *Reminder*\n\n*${reminder.title}*\n\n_Reply *my reminders* to manage, or set another with *remind me …*_`
      );
      await reminderStore.markReminderSent(phone, reminder);
      sent += 1;
    } catch (err) {
      const logger = require('../core/logger');
      logger.warn('Reminder send failed', { phone, id: reminder.id, error: err.message });
    }
  }
  return { ok: true, due: due.length, sent };
}

module.exports = {
  handleReminderCommand,
  showRemindersMenu,
  dispatchDueReminders,
};
