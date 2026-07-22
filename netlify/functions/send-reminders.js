/**
 * Scheduled: send due WhatsApp reminders every 15 minutes.
 * Netlify cron — see netlify.toml [[functions.send-reminders]]
 */
const { initSupabase } = require('../../src/db/supabase');
const { dispatchDueReminders } = require('../../src/reminders/reminderHandler');
const logger = require('../../src/core/logger');

initSupabase();

exports.handler = async () => {
  try {
    const result = await dispatchDueReminders();
    logger.info('Reminder cron done', result);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err) {
    logger.error('Reminder cron failed', { message: err.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
