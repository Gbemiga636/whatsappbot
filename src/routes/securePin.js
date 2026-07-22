/**
 * Secure PIN web portal — set, verify, and change transaction PIN outside WhatsApp chat.
 */

const express = require('express');
const transactionPin = require('../security/transactionPin');
const { verifyPinToken, markPinTokenUsed } = require('../security/pinToken');
const { getSession, loadSessionFromDb } = require('../sessionStore');
const { sendText } = require('../whatsapp');
const logger = require('../core/logger');

const router = express.Router();

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLES = `
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0b1220;color:#f1f5f9;margin:0;padding:20px;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:linear-gradient(160deg,#1e293b 0%,#0f172a 100%);border:1px solid #334155;border-radius:20px;padding:28px;max-width:420px;width:100%;box-shadow:0 16px 48px rgba(0,0,0,.45)}
.badge{display:inline-block;background:#0ea5e920;color:#38bdf8;font-size:.75rem;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:12px}
h1{font-size:1.35rem;margin:0 0 8px}
.lead{color:#94a3b8;font-size:.92rem;margin:0 0 22px;line-height:1.5}
label{display:block;font-size:.85rem;margin:14px 0 6px;color:#cbd5e1}
input{width:100%;padding:14px;border-radius:10px;border:1px solid #475569;background:#020617;color:#fff;font-size:1.25rem;letter-spacing:.35em;text-align:center}
input:focus{outline:none;border-color:#38bdf8;box-shadow:0 0 0 3px #38bdf820}
.hint{font-size:.78rem;color:#64748b;margin-top:6px}
button{width:100%;margin-top:22px;padding:15px;border:none;border-radius:10px;background:linear-gradient(135deg,#e11d48,#be123c);color:#fff;font-size:1rem;font-weight:600;cursor:pointer}
button:hover{filter:brightness(1.05)}
.err{background:#7f1d1d;color:#fecaca;padding:12px;border-radius:10px;margin-bottom:14px;font-size:.88rem}
.ok{text-align:center;padding:16px 0}
.ok h2{color:#4ade80;margin:0 0 10px}
.ok p{color:#94a3b8}
.shield{text-align:center;font-size:2.5rem;margin-bottom:8px}
.summary{background:#0f172a;border:1px solid #334155;border-radius:12px;padding:14px;margin-bottom:18px;font-size:.9rem;color:#cbd5e1}
`;

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>${esc(title)} · Bygate Secure PIN</title>
<style>${STYLES}</style>
</head><body><div class="card">${body}</div></body></html>`;
}

function pinFields({ includeCurrent = false, submitLabel = 'Save PIN' }) {
  let html = '';
  if (includeCurrent) {
    html += `<label for="current">Current PIN</label>
<input id="current" name="current" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required placeholder="····"/>
<p class="hint">Enter your existing 4-digit PIN</p>`;
  }
  html += `<label for="pin">${includeCurrent ? 'New PIN' : '4-digit PIN'}</label>
<input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required placeholder="····"/>
<p class="hint">Numbers only · not stored in WhatsApp chat</p>
<label for="confirm">Confirm PIN</label>
<input id="confirm" name="confirm" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required placeholder="····"/>
<button type="submit">${esc(submitLabel)}</button>`;
  return html;
}

function invalidTokenPage() {
  return page(
    'Link expired',
    `<div class="shield">🔒</div>
<h1>Link expired or invalid</h1>
<p class="lead">Return to WhatsApp and request a new secure PIN link from <strong>Wallet</strong> or retry your purchase.</p>`
  );
}

function successPage({ title, message }) {
  return page(
    title,
    `<div class="ok">
<div class="shield">✅</div>
<h2>${esc(title)}</h2>
<p>${message}</p>
<p style="margin-top:20px">You can close this page and return to <strong>WhatsApp</strong>.</p>
</div>`
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
        'Purchase session expired. Return to WhatsApp, open the service again, and tap *Confirm* to retry.',
    };
  }

  const { resumePendingPurchase } = require('../security/pinGate');
  // Caller already verified or set PIN on this secure page
  return resumePendingPurchase(phone, pending, { pinVerified: true });
}

function renderSetForm(token, error = '') {
  const err = error ? `<div class="err">${esc(error)}</div>` : '';
  return page(
    'Set PIN',
    `<span class="badge">🔒 Secure · Bygate</span>
<h1>Create transaction PIN</h1>
<p class="lead">Choose a 4-digit PIN for wallet payments. It is encrypted and never appears in your WhatsApp chat.</p>
${err}
<form method="post" action="/pin/set">
<input type="hidden" name="token" value="${esc(token)}"/>
${pinFields({ submitLabel: 'Set PIN' })}
</form>`
  );
}

function renderVerifyForm(token, summary, error = '') {
  const err = error ? `<div class="err">${esc(error)}</div>` : '';
  const box = summary
    ? `<div class="summary"><strong>Payment</strong><br/>${esc(summary)}</div>`
    : '';
  return page(
    'Authorize',
    `<span class="badge">🔒 Secure · Bygate</span>
<h1>Authorize payment</h1>
<p class="lead">Enter your transaction PIN to confirm this payment.</p>
${box}
${err}
<form method="post" action="/pin/verify">
<input type="hidden" name="token" value="${esc(token)}"/>
<label for="pin">Transaction PIN</label>
<input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required placeholder="····"/>
<button type="submit">Authorize payment</button>
</form>`
  );
}

function renderChangeForm(token, error = '') {
  const err = error ? `<div class="err">${esc(error)}</div>` : '';
  return page(
    'Change PIN',
    `<span class="badge">🔒 Secure · Bygate</span>
<h1>Change transaction PIN</h1>
<p class="lead">Update your 4-digit PIN used for payments and transfers.</p>
${err}
<form method="post" action="/pin/change">
<input type="hidden" name="token" value="${esc(token)}"/>
${pinFields({ includeCurrent: true, submitLabel: 'Update PIN' })}
</form>`
  );
}

router.get('/set', (req, res) => {
  const payload = verifyPinToken(req.query.token);
  if (!payload || payload.purpose !== 'set') return res.status(400).send(invalidTokenPage());
  return res.send(renderSetForm(req.query.token));
});

router.post('/set', async (req, res) => {
  const payload = verifyPinToken(req.body.token);
  if (!payload || payload.purpose !== 'set') return res.status(400).send(invalidTokenPage());

  const pin = String(req.body.pin || '').replace(/\D/g, '');
  const confirm = String(req.body.confirm || '').replace(/\D/g, '');

  if (pin !== confirm) return res.send(renderSetForm(req.body.token, 'PINs do not match. Try again.'));

  const result = await transactionPin.setPin(payload.phone, pin);
  if (!result.ok) return res.send(renderSetForm(req.body.token, result.message));

  markPinTokenUsed(payload);

  await notifyWhatsApp(
    payload.phone,
    '✅ *Transaction PIN set!*\n\nFuture payments authorize on the secure Bygate page — never in chat.'
  );

  const purchase = await finishPendingPurchase(payload.phone, payload);
  if (purchase?.ok) {
    return res.send(
      successPage({
        title: 'PIN set & payment sent',
        message: 'Your PIN is active and your purchase is processing. Check WhatsApp for confirmation.',
      })
    );
  }

  return res.send(
    successPage({
      title: 'PIN set successfully',
      message: 'You can now make purchases. WhatsApp will open the secure page when authorization is needed.',
    })
  );
});

router.get('/verify', async (req, res) => {
  const payload = verifyPinToken(req.query.token);
  if (!payload || payload.purpose !== 'verify') return res.status(400).send(invalidTokenPage());

  const pending = await resolvePendingPurchase(payload.phone, payload);
  const summary = pending?.summaryText || '';

  return res.send(renderVerifyForm(req.query.token, summary));
});

router.post('/verify', async (req, res) => {
  const payload = verifyPinToken(req.body.token);
  if (!payload || payload.purpose !== 'verify') return res.status(400).send(invalidTokenPage());

  const pin = String(req.body.pin || '').replace(/\D/g, '');
  const pending = await resolvePendingPurchase(payload.phone, payload);
  const summary = pending?.summaryText || '';

  const result = await transactionPin.verifyPin(payload.phone, pin);
  if (!result.ok) {
    return res.send(renderVerifyForm(req.body.token, summary, result.message));
  }

  markPinTokenUsed(payload);

  const purchase = await finishPendingPurchase(payload.phone, payload);

  if (!purchase?.ok && !purchase?.awaitingPin && !purchase?.offeredCredit && !purchase?.prompted) {
    return res.send(
      successPage({
        title: 'Payment not completed',
        message: esc(purchase?.message || 'Payment could not be completed. Check WhatsApp for details.'),
      })
    );
  }

  return res.send(
    successPage({
      title: 'Payment authorized',
      message: 'Your PIN was verified. Return to WhatsApp for your receipt.',
    })
  );
});

router.get('/change', (req, res) => {
  const payload = verifyPinToken(req.query.token);
  if (!payload || payload.purpose !== 'change') return res.status(400).send(invalidTokenPage());
  return res.send(renderChangeForm(req.query.token));
});

router.post('/change', async (req, res) => {
  const payload = verifyPinToken(req.body.token);
  if (!payload || payload.purpose !== 'change') return res.status(400).send(invalidTokenPage());

  const current = String(req.body.current || '').replace(/\D/g, '');
  const pin = String(req.body.pin || '').replace(/\D/g, '');
  const confirm = String(req.body.confirm || '').replace(/\D/g, '');

  if (pin !== confirm) return res.send(renderChangeForm(req.body.token, 'New PINs do not match.'));

  const check = await transactionPin.verifyPin(payload.phone, current);
  if (!check.ok) return res.send(renderChangeForm(req.body.token, check.message));

  const result = await transactionPin.setPin(payload.phone, pin);
  if (!result.ok) return res.send(renderChangeForm(req.body.token, result.message));

  markPinTokenUsed(payload);

  await notifyWhatsApp(payload.phone, '✅ *Transaction PIN updated!*');

  return res.send(
    successPage({
      title: 'PIN updated',
      message: 'Your new PIN is active for all future payments.',
    })
  );
});

module.exports = router;
