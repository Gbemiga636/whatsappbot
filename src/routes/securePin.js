/**
 * Secure PIN web portal — Bygate-branded set / verify / change.
 */

const express = require('express');
const transactionPin = require('../security/transactionPin');
const { verifyPinToken, markPinTokenUsed } = require('../security/pinToken');
const { getSession, loadSessionFromDb } = require('../sessionStore');
const { sendText } = require('../whatsapp');
const logger = require('../core/logger');
const {
  escapeHtml,
  renderFormPage,
  renderSuccessPage,
  renderInvalidPage,
} = require('./bygateSecureUi');

const router = express.Router();

function waDeepLink() {
  const num = (
    process.env.ADMIN_WHATSAPP_NUMBER ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    ''
  ).replace(/\D/g, '');
  return num ? `https://wa.me/${num}?text=${encodeURIComponent('menu')}` : '';
}

function pinFields({ includeCurrent = false, submitLabel = 'Save PIN' }) {
  let html = '';
  if (includeCurrent) {
    html += `<label for="current">Current PIN</label>
<input class="pin-input" id="current" name="current" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required placeholder="····"/>
<p class="hint">Your existing 4-digit PIN</p>`;
  }
  html += `<label for="pin">${includeCurrent ? 'New PIN' : 'Create 4-digit PIN'}</label>
<input class="pin-input" id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required placeholder="····"/>
<p class="hint">Numbers only · this is your forever transaction PIN</p>
<label for="confirm">Confirm PIN</label>
<input class="pin-input" id="confirm" name="confirm" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required placeholder="····"/>
<button class="btn" type="submit">${escapeHtml(submitLabel)}</button>`;
  return html;
}

function invalidTokenPage() {
  return renderInvalidPage(
    'This secure link expired or was already used. Return to WhatsApp and open Wallet → Set PIN, or retry your purchase.'
  );
}

async function notifyWhatsApp(phone, text) {
  try {
    await sendText(phone, text);
  } catch (err) {
    logger.warn('PIN portal WhatsApp notify failed', { phone, error: err.message });
  }
}

async function resolvePendingPurchase(phone, tokenPayload) {
  const session = (await loadSessionFromDb(phone)) || getSession(phone) || {};
  return session.data?.pendingPurchase || tokenPayload?.pending || null;
}

async function finishPendingPurchase(phone, tokenPayload) {
  const pending = await resolvePendingPurchase(phone, tokenPayload);
  if (!pending) {
    return {
      ok: false,
      message:
        'Purchase session expired. Return to WhatsApp, open the service again, and tap Confirm to retry.',
    };
  }
  const { resumePendingPurchase } = require('../security/pinGate');
  return resumePendingPurchase(phone, pending, { pinVerified: true });
}

function renderSetForm(token, error = '') {
  return renderFormPage({
    title: 'Set PIN',
    badge: '🔒 Secure PIN',
    heading: 'Create your transaction PIN',
    lead: 'Choose a <strong>4-digit PIN</strong> once. You’ll use this same PIN for every wallet payment — never typed in WhatsApp chat.',
    error,
    formHtml: `<form method="post" action="/pin/set">
<input type="hidden" name="token" value="${escapeHtml(token)}"/>
${pinFields({ submitLabel: 'Set my PIN' })}
</form>`,
  });
}

function renderVerifyForm(token, summary, error = '') {
  const box = summary
    ? `<div class="summary"><strong>Payment</strong><br/>${escapeHtml(summary)}</div>`
    : '';
  return renderFormPage({
    title: 'Authorize',
    badge: '🔒 Authorize payment',
    heading: 'Enter your PIN',
    lead: 'Confirm this payment with the transaction PIN you created for your Bygate account.',
    error,
    formHtml: `${box}
<form method="post" action="/pin/verify">
<input type="hidden" name="token" value="${escapeHtml(token)}"/>
<label for="pin">Transaction PIN</label>
<input class="pin-input" id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required placeholder="····"/>
<button class="btn" type="submit">Authorize payment</button>
</form>`,
  });
}

function renderChangeForm(token, error = '') {
  return renderFormPage({
    title: 'Change PIN',
    badge: '🔒 Secure PIN',
    heading: 'Change transaction PIN',
    lead: 'Update the 4-digit PIN used for payments and transfers on Bygate.',
    error,
    formHtml: `<form method="post" action="/pin/change">
<input type="hidden" name="token" value="${escapeHtml(token)}"/>
${pinFields({ includeCurrent: true, submitLabel: 'Update PIN' })}
</form>`,
  });
}

router.get('/set', (req, res) => {
  const payload = verifyPinToken(req.query.token);
  if (!payload || payload.purpose !== 'set') return res.status(400).send(invalidTokenPage());
  return res.type('html').send(renderSetForm(req.query.token));
});

router.post('/set', async (req, res) => {
  const payload = verifyPinToken(req.body.token);
  if (!payload || payload.purpose !== 'set') return res.status(400).send(invalidTokenPage());

  const pin = String(req.body.pin || '').replace(/\D/g, '');
  const confirm = String(req.body.confirm || '').replace(/\D/g, '');

  if (pin !== confirm) {
    return res.type('html').send(renderSetForm(req.body.token, 'PINs do not match. Try again.'));
  }

  const result = await transactionPin.setPin(payload.phone, pin);
  if (!result.ok) return res.type('html').send(renderSetForm(req.body.token, result.message));

  markPinTokenUsed(payload);

  await notifyWhatsApp(payload.phone, '✅ PIN set. You can buy with your wallet now.');

  const purchase = await finishPendingPurchase(payload.phone, payload);
  if (purchase?.ok) {
    return res.type('html').send(
      renderSuccessPage({
        title: 'PIN set',
        heading: 'PIN set & payment sent',
        message: 'Your PIN is active and your purchase is processing. Check WhatsApp for confirmation.',
        waHref: waDeepLink(),
      })
    );
  }

  return res.type('html').send(
    renderSuccessPage({
      title: 'PIN set',
      heading: 'You’re all set',
      message: 'Your transaction PIN is saved. Return to WhatsApp — you’ll use this same PIN for every wallet payment.',
      waHref: waDeepLink(),
    })
  );
});

router.get('/verify', async (req, res) => {
  const payload = verifyPinToken(req.query.token);
  if (!payload || payload.purpose !== 'verify') return res.status(400).send(invalidTokenPage());
  const pending = await resolvePendingPurchase(payload.phone, payload);
  return res.type('html').send(renderVerifyForm(req.query.token, pending?.summaryText || ''));
});

router.post('/verify', async (req, res) => {
  const payload = verifyPinToken(req.body.token);
  if (!payload || payload.purpose !== 'verify') return res.status(400).send(invalidTokenPage());

  const pin = String(req.body.pin || '').replace(/\D/g, '');
  const pending = await resolvePendingPurchase(payload.phone, payload);
  const summary = pending?.summaryText || '';

  const result = await transactionPin.verifyPin(payload.phone, pin);
  if (!result.ok) {
    return res.type('html').send(renderVerifyForm(req.body.token, summary, result.message));
  }

  markPinTokenUsed(payload);
  const purchase = await finishPendingPurchase(payload.phone, payload);

  if (!purchase?.ok && !purchase?.awaitingPin && !purchase?.offeredCredit && !purchase?.prompted) {
    return res.type('html').send(
      renderSuccessPage({
        title: 'Payment',
        heading: 'Payment not completed',
        message: escapeHtml(purchase?.message || 'Check WhatsApp for details and try again.'),
        waHref: waDeepLink(),
      })
    );
  }

  return res.type('html').send(
    renderSuccessPage({
      title: 'Authorized',
      heading: 'Payment authorized',
      message: 'Your PIN was verified. Return to WhatsApp for your receipt — it should arrive shortly.',
      waHref: waDeepLink(),
    })
  );
});

router.get('/change', (req, res) => {
  const payload = verifyPinToken(req.query.token);
  if (!payload || payload.purpose !== 'change') return res.status(400).send(invalidTokenPage());
  return res.type('html').send(renderChangeForm(req.query.token));
});

router.post('/change', async (req, res) => {
  const payload = verifyPinToken(req.body.token);
  if (!payload || payload.purpose !== 'change') return res.status(400).send(invalidTokenPage());

  const current = String(req.body.current || '').replace(/\D/g, '');
  const pin = String(req.body.pin || '').replace(/\D/g, '');
  const confirm = String(req.body.confirm || '').replace(/\D/g, '');

  if (pin !== confirm) {
    return res.type('html').send(renderChangeForm(req.body.token, 'New PINs do not match.'));
  }

  const check = await transactionPin.verifyPin(payload.phone, current);
  if (!check.ok) return res.type('html').send(renderChangeForm(req.body.token, check.message));

  const result = await transactionPin.setPin(payload.phone, pin);
  if (!result.ok) return res.type('html').send(renderChangeForm(req.body.token, result.message));

  markPinTokenUsed(payload);
  await notifyWhatsApp(payload.phone, '✅ PIN updated.');

  return res.type('html').send(
    renderSuccessPage({
      title: 'PIN updated',
      heading: 'PIN updated',
      message: 'Your new transaction PIN is active for all future Bygate payments.',
      waHref: waDeepLink(),
    })
  );
});

module.exports = router;
