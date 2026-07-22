const express = require('express');
const config = require('./config');
const whatsapp = require('./whatsapp');
const { handleIncomingMessage } = require('./router/superAppRouter');
const secureAuth = require('./routes/secureAuth');
const securePin = require('./routes/securePin');
const { handlePaystackWebhook, paystackCallback } = require('./routes/paystackWebhook');
const { parseWebhookMessage, shouldHandleWebhook } = require('./webhookFilter');
const { initSupabase, isSupabaseReady } = require('./db/supabase');
const { hasServiceRoleKey } = require('./auth/supabaseAuth');
const { claimMessage } = require('./utils/messageDedupe');
const logger = require('./core/logger');

initSupabase();

const app = express();

/** Paystack webhook — needs raw body for signature verification */
app.post(
  '/webhook/paystack',
  express.raw({ type: 'application/json' }),
  (req, _res, next) => {
    try {
      req.rawBody = req.body;
      req.body = JSON.parse(req.body.toString('utf8'));
    } catch {
      req.body = {};
    }
    next();
  },
  handlePaystackWebhook
);

app.get('/webhook/paystack/callback', paystackCallback);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/auth', secureAuth);
app.use('/pin', securePin);

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'bygate-super-app',
    brand: config.brand?.name || 'Bygate',
    hint: 'Use /health or configure Meta webhook at /webhook',
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'bygate-super-app',
    brand: config.brand?.name || 'Bygate',
    version: '2.2.0',
    supabase: isSupabaseReady(),
    supabaseServiceRole: hasServiceRoleKey(),
    paystack: !!config.payments.paystack.secretKey,
    billsProvider: config.bills.provider,
    clubKonnect: !!(config.bills.clubkonnect.userId && config.bills.clubkonnect.apiKey),
    autoSyncNg: !!config.bills.autosyncng.apiKey,
    vtpass: !!config.bills.vtpass.apiKey,
    whatsapp: {
      phoneNumberIdSet: !!config.whatsapp.phoneNumberId,
      phoneNumberIdSuffix: config.whatsapp.phoneNumberId
        ? `…${config.whatsapp.phoneNumberId.slice(-6)}`
        : null,
      phoneNumberIdLength: config.whatsapp.phoneNumberId?.length || 0,
      phoneNumberIdValid: /^\d{10,20}$/.test(config.whatsapp.phoneNumberId || ''),
      tokenSet: !!config.whatsapp.token,
      verifyTokenSet: !!config.whatsapp.verifyToken,
    },
    publicBaseUrl: config.publicBaseUrl || null,
    features: config.features,
    commission: config.wallet.commissionPercent,
  });
});

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('Webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

async function processWebhookMessages(parsed) {
  const { messages, displayNumber } = parsed;

  for (const message of messages) {
    const from = message.from;
    const messageId = message.id;

    if (messageId && !(await claimMessage(messageId))) {
      continue;
    }

    logger.info('Incoming message', { from, to: displayNumber, messageId });

    try {
      if (messageId) {
        try {
          await whatsapp.markAsRead(messageId);
        } catch (readErr) {
          logger.warn('markAsRead failed', { message: readErr.message });
        }
      }

      await handleIncomingMessage(from, message);

      if (messageId) {
        const { markMessageProcessed } = require('./utils/messageDedupe');
        await markMessageProcessed(messageId);
      }
    } catch (msgErr) {
      // Allow Meta retry / next delivery to try again
      const { releaseProcessing } = require('./utils/messageDedupe');
      releaseProcessing(messageId);

      logger.error('Message handler failed', {
        from,
        message: msgErr.response?.data?.error?.message || msgErr.message,
        code: msgErr.response?.data?.error?.code,
      });
      try {
        const digits = String(from).replace(/\D/g, '');
        await whatsapp.sendText(
          digits,
          '⚠️ *Something went wrong* while processing your message.\n\nType *menu* or *hi* to try again.'
        );
      } catch (sendErr) {
        logger.error('Could not send error reply', { message: sendErr.message });
      }
    }
  }
}

app.post('/webhook', async (req, res) => {
  try {
    const parsed = parseWebhookMessage(req.body);
    if (!parsed) {
      res.sendStatus(200);
      return;
    }

    const decision = shouldHandleWebhook(parsed, config.whatsapp.phoneNumberId);
    if (!decision.handle) {
      logger.warn('Webhook ignored', decision);
      res.sendStatus(200);
      return;
    }

    // Process BEFORE responding. On Netlify, the function freezes after 200,
    // so early ACK caused no blue ticks and no replies.
    await processWebhookMessages(parsed);
    res.sendStatus(200);
  } catch (err) {
    logger.error('Webhook error', {
      message: err.response?.data?.error?.message || err.message,
      code: err.response?.data?.error?.code,
      type: err.response?.data?.error?.type,
      status: err.response?.status,
    });
    if (!res.headersSent) res.sendStatus(200);
  }
});

module.exports = app;
