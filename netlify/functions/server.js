/**
 * Netlify serverless entry — wraps Express for WhatsApp/pay webhooks.
 * Errors are returned in the body so Netlify 502s are diagnosable.
 */
let cachedHandler;

function loadHandler() {
  if (cachedHandler) return cachedHandler;
  const serverless = require('serverless-http');
  const app = require('../../src/app');
  cachedHandler = serverless(app, {
    binary: ['image/*', 'application/pdf', 'application/octet-stream'],
  });
  return cachedHandler;
}

exports.handler = async (event, context) => {
  try {
    const handler = loadHandler();
    return await handler(event, context);
  } catch (err) {
    console.error('Bot function failed', err);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: err?.message || String(err),
        name: err?.name || null,
      }),
    };
  }
};
