/**
 * Local development entry — starts HTTP server.
 * Vercel uses api/index.js instead (serverless, no app.listen).
 */
const config = require('./config');
const app = require('./app');
const { isSupabaseReady } = require('./db/supabase');
const logger = require('./core/logger');

if (require.main === module) {
  app.listen(config.port, () => {
    logger.info('Bygate Super App started', {
      port: config.port,
      supabase: isSupabaseReady(),
      paystack: !!config.payments.paystack.secretKey,
      billsProvider: config.bills.provider,
      commission: `${config.wallet.commissionPercent}%`,
      publicBaseUrl: config.publicBaseUrl || '(not set — PIN portal & webhooks need tunnel)',
    });

    if (!config.publicBaseUrl) {
      logger.warn('PUBLIC_BASE_URL is missing — PIN portal links and Meta webhooks will not work until set');
    }

    // Local/dev: check reminders every 5 minutes (Netlify uses send-reminders cron)
    const reminderHandler = require('./reminders/reminderHandler');
    const tick = async () => {
      try {
        await reminderHandler.dispatchDueReminders();
      } catch (err) {
        logger.warn('Reminder tick failed', { message: err.message });
      }
    };
    setInterval(tick, 5 * 60 * 1000);
    setTimeout(tick, 20 * 1000);
  });
}

module.exports = app;
