const express = require('express');
const config = require('./config');
const whatsapp = require('./whatsapp');
const { handleIncomingMessage } = require('./router/superAppRouter');
const secureAuth = require('./routes/secureAuth');
const securePin = require('./routes/securePin');
const { handlePaystackWebhook, paystackCallback } = require('./routes/paystackWebhook');
const { parseWebhookMessage, shouldHandleWebhook } = require('./webhookFilter');
const { initSupabase, isSupabaseReady } = require('./db/supabase');
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

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'mysogi-super-app',
    version: '2.1.0',
    supabase: isSupabaseReady(),
    paystack: !!config.payments.paystack.secretKey,
    billsProvider: config.bills.provider,
    erightVtu: !!config.bills.erightvtu.apiKey,
    vtpass: !!config.bills.vtpass.apiKey,
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

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const parsed = parseWebhookMessage(req.body);
    if (!parsed) return;

    const decision = shouldHandleWebhook(parsed, config.whatsapp.phoneNumberId);
    if (!decision.handle) return;

    const { messages, displayNumber } = parsed;

    for (const message of messages) {
      const from = message.from;
      logger.info('Incoming message', { from, to: displayNumber });

      if (message.id) await whatsapp.markAsRead(message.id);
      await handleIncomingMessage(from, message);
    }
  } catch (err) {
    logger.error('Webhook error', {
      message: err.response?.data?.error?.message || err.message,
      code: err.response?.data?.error?.code,
      type: err.response?.data?.error?.type,
      status: err.response?.status,
    });
  }
});

app.listen(config.port, () => {
  logger.info('Mysogi Super App started', {
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
});
