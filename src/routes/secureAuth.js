/**
 * Secure WhatsApp auth portal — login & signup outside chat (Bygate brand).
 * After signup, user is redirected to set their forever transaction PIN.
 */

const express = require('express');
const { signIn, signUp, isValidEmail, isValidName } = require('../auth/supabaseAuth');
const { createPinToken, verifyPinToken, markPinTokenUsed } = require('../security/pinToken');
const { setSession } = require('../sessionStore');
const { sendText } = require('../whatsapp');
const transactionPin = require('../security/transactionPin');
const config = require('../config');
const logger = require('../core/logger');
const {
  escapeHtml,
  renderFormPage,
  renderSuccessPage,
  renderInvalidPage,
} = require('./bygateSecureUi');

const router = express.Router();

function publicBase() {
  return (config.publicBaseUrl || '').replace(/\/$/, '');
}

function waDeepLink() {
  const num = (
    process.env.ADMIN_WHATSAPP_NUMBER ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    ''
  ).replace(/\D/g, '');
  return num ? `https://wa.me/${num}?text=${encodeURIComponent('menu')}` : '';
}

function requireAuthToken(token, purpose) {
  const payload = verifyPinToken(token);
  if (!payload || payload.purpose !== purpose) return null;
  return payload;
}

async function notify(phone, text) {
  try {
    await sendText(phone, text);
  } catch (err) {
    logger.warn('Auth portal WhatsApp notify failed', { phone, error: err.message });
  }
}

function loginForm(token, error = '', email = '') {
  return renderFormPage({
    title: 'Log in',
    badge: '🔐 Secure login',
    heading: 'Log in to Bygate',
    lead: 'Enter your email and password here — <strong>never in WhatsApp chat</strong>.',
    error,
    formHtml: `<form method="post" action="/auth/login">
<input type="hidden" name="token" value="${escapeHtml(token)}"/>
<label for="email">Email</label>
<input id="email" type="email" name="email" required autocomplete="username" value="${escapeHtml(email)}"/>
<label for="password">Password</label>
<input id="password" type="password" name="password" required autocomplete="current-password"/>
<button class="btn" type="submit">Log in</button>
</form>
<p class="foot">No account? Return to WhatsApp and tap <strong>Sign up</strong>.</p>`,
  });
}

function signupForm(token, error = '', values = {}) {
  return renderFormPage({
    title: 'Sign up',
    badge: '✨ Create account',
    heading: 'Create your Bygate account',
    lead: 'Password stays on this secure page. After signup you’ll set your <strong>forever transaction PIN</strong>.',
    error,
    formHtml: `<form method="post" action="/auth/signup">
<input type="hidden" name="token" value="${escapeHtml(token)}"/>
<label for="firstName">First name</label>
<input id="firstName" name="firstName" required minlength="2" value="${escapeHtml(values.firstName || '')}"/>
<label for="lastName">Last name</label>
<input id="lastName" name="lastName" required minlength="2" value="${escapeHtml(values.lastName || '')}"/>
<label for="email">Email</label>
<input id="email" type="email" name="email" required autocomplete="username" value="${escapeHtml(values.email || '')}"/>
<label for="password">Password</label>
<input id="password" type="password" name="password" required minlength="6" autocomplete="new-password"/>
<p class="hint">Min 6 characters · never typed in WhatsApp</p>
<button class="btn" type="submit">Create account &amp; set PIN</button>
</form>`,
  });
}

router.get('/login', (req, res) => {
  const payload = requireAuthToken(req.query.token, 'auth_login');
  if (!payload) return res.status(400).type('html').send(renderInvalidPage());
  return res.type('html').send(loginForm(req.query.token));
});

router.post('/login', async (req, res) => {
  const payload = requireAuthToken(req.body.token, 'auth_login');
  if (!payload) return res.status(400).type('html').send(renderInvalidPage());

  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');

  if (!isValidEmail(email)) {
    return res.type('html').send(loginForm(req.body.token, 'Enter a valid email.', email));
  }

  const result = await signIn({ phone: payload.phone, email, password });
  if (!result.ok) {
    return res.type('html').send(loginForm(req.body.token, result.message, email));
  }

  markPinTokenUsed(payload);
  setSession(payload.phone, {
    step: 'super_menu',
    activeService: null,
    data: { authMode: 'authenticated', userEmail: result.user.email },
  });

  const pinSet = await transactionPin.isPinSetAsync(payload.phone);
  if (!pinSet) {
    const { token: pinToken } = createPinToken(payload.phone, 'set');
    await notify(
      payload.phone,
      `✅ Welcome back! Set your PIN next.`
    );
    return res.redirect(302, `${publicBase()}/pin/set?token=${encodeURIComponent(pinToken)}`);
  }

  await notify(
    payload.phone,
    `✅ Welcome back, ${result.user.firstName || 'friend'}! Type *menu*.`
  );

  return res.type('html').send(
    renderSuccessPage({
      title: 'Logged in',
      heading: 'You’re logged in',
      message: 'Return to WhatsApp and type menu to open Bygate.',
      waHref: waDeepLink(),
    })
  );
});

router.get('/signup', (req, res) => {
  const payload = requireAuthToken(req.query.token, 'auth_signup');
  if (!payload) return res.status(400).type('html').send(renderInvalidPage());
  return res.type('html').send(signupForm(req.query.token));
});

router.post('/signup', async (req, res) => {
  const payload = requireAuthToken(req.body.token, 'auth_signup');
  if (!payload) return res.status(400).type('html').send(renderInvalidPage());

  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');
  const values = { firstName, lastName, email };

  if (!isValidName(firstName) || !isValidName(lastName)) {
    return res
      .type('html')
      .send(signupForm(req.body.token, 'First and last name must be at least 2 characters.', values));
  }
  if (!isValidEmail(email)) {
    return res.type('html').send(signupForm(req.body.token, 'Enter a valid email address.', values));
  }
  if (!password || password.length < 6) {
    return res
      .type('html')
      .send(signupForm(req.body.token, 'Password must be at least 6 characters.', values));
  }

  const result = await signUp({
    phone: payload.phone,
    email,
    password,
    firstName,
    lastName,
  });

  if (!result.ok) {
    return res.type('html').send(signupForm(req.body.token, result.message, values));
  }

  markPinTokenUsed(payload);
  setSession(payload.phone, {
    step: 'super_menu',
    activeService: null,
    data: { authMode: 'authenticated', userEmail: result.user.email, needsPinSetup: true },
  });

  const { token: pinToken } = createPinToken(payload.phone, 'set');
  await notify(
    payload.phone,
    `✅ Account created, ${firstName}! Set your PIN on the next page.`
  );

  // Force PIN setup immediately after account creation
  return res.redirect(302, `${publicBase()}/pin/set?token=${encodeURIComponent(pinToken)}`);
});

module.exports = router;
