/**
 * Reminder chat commands + menu entry.
 */

const whatsapp = require('../whatsapp');
const reminderStore = require('./reminderStore');

async function handleReminderCommand(phone, text) {
  const cmd = reminderStore.parseReminderCommand(text);
  if (!cmd) return false;

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
    const result = await reminderStore.addReminder(phone, {
      title: cmd.title,
      whenText: cmd.whenText,
    });
    if (!result.ok) {
      await whatsapp.sendText(phone, `❌ ${result.message}`);
      return true;
    }
    const r = result.reminder;
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

  return false;
}

async function showRemindersMenu(phone) {
  await whatsapp.sendText(phone, reminderStore.remindersHelp());
}

/**
 * Deliver due reminders (called by cron / scheduled function).
 */
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
