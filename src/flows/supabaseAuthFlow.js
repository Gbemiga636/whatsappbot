/**
 * WhatsApp auth flow — Supabase signup & login.
 */

const whatsapp = require('../whatsapp');
const {
  isValidEmail,
  isValidName,
  signUp,
  signIn,
  sendEmailOtp,
  verifyEmailOtp,
  formatPhone,
} = require('../auth/supabaseAuth');

function formatName(user) {
  const first = (user?.firstName || user?.first_name || '').trim();
  if (first) return first;
  const email = (user?.email || '').trim();
  if (email.includes('@')) return email.split('@')[0];
  return 'there';
}

function parseSignupBulk(text) {
  const line = String(text || '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = line.split(/\s*[|,;]\s*/).map((p) => p.trim()).filter(Boolean);

  if (parts.length < 4) {
    return {
      ok: false,
      message:
        'Send all details in *one line*:\n\n' +
        'First name | Last name | Email | Password\n\n' +
        'Example:\nAda | Okafor | ada@email.com | mypass123',
    };
  }

  const [firstName, lastName, email, password] = parts;

  if (!isValidName(firstName) || !isValidName(lastName)) {
    return { ok: false, message: 'First and last name must be at least 2 characters each.' };
  }
  if (!isValidEmail(email)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  if (!password || password.length < 6) {
    return { ok: false, message: 'Password must be at least 6 characters.' };
  }

  return {
    ok: true,
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      password,
    },
  };
}

async function showAuthWelcome(phone) {
  await whatsapp.sendText(
    phone,
    `*Welcome to Mysogi* 🌍\n\n` +
      `Africa's WhatsApp Super App — banking, bills, food, shopping, loans, travel, AI & more.\n\n` +
      `*Create an account*, *log in*, or *continue as guest*.\n` +
      `_Guests pay securely via Paystack at checkout — no signup needed._\n\n` +
      `_Your WhatsApp number: +${formatPhone(phone)}_`
  );

  await whatsapp.sendButtons(phone, 'How would you like to continue?', [
    { id: 'auth_guest', title: '👤 Continue as guest' },
    { id: 'auth_login', title: '🔐 Log in' },
    { id: 'auth_signup', title: '✨ Sign up' },
  ]);

  return { step: 'auth_welcome', data: { authMode: 'pending' } };
}

async function startGuest(phone) {
  const { setUser } = require('../userStore');
  const wallet = require('../wallet/walletService');
  const { showSuperAppMenu } = require('../router/superAppMenu');

  await wallet.ensureWalletUser(phone);
  setUser(phone, {
    authMode: 'guest',
    email: null,
    mysogiToken: null,
    firstName: null,
    lastName: null,
  });

  await whatsapp.sendText(
    phone,
    `👤 *Guest mode*\n\n` +
      `Browse and order airtime, data, bills, food & more.\n` +
      `When you pay, we'll send a *Paystack link* (card, bank, USSD).\n\n` +
      `_Create an account anytime to use your wallet & save history._`
  );

  await showSuperAppMenu(phone);
  return { step: 'super_menu', data: { authMode: 'guest' } };
}

async function startLogin(phone) {
  await whatsapp.sendText(
    phone,
    `*Log in to Mysogi*\n\n` +
      `Reply with your *email address*.\n\n` +
      `_Or send: email | password (one line)_\n` +
      `_Type *menu* or *cancel* to go back._`
  );
  return { step: 'auth_login_email', data: { authMode: 'login_pending' } };
}

async function startSignup(phone) {
  await whatsapp.sendText(
    phone,
    `*Create your Mysogi account*\n\n` +
      `Send all details in *one line* (use *|* or *,* between fields):\n\n` +
      `*Format:*\nFirst name | Last name | Email | Password\n\n` +
      `*Example:*\nAda | Okafor | ada@email.com | mypass123\n\n` +
      `Phone: *+${formatPhone(phone)}* (from WhatsApp)\n` +
      `_Password: min 6 characters. Type *menu* or *cancel* to go back._`
  );
  return { step: 'auth_signup', data: { authMode: 'signup_pending', signupStep: 'bulk' } };
}

async function showSignupConfirm(phone, draft) {
  await whatsapp.sendButtons(
    phone,
    `*Confirm your account*\n\n` +
      `Name: ${draft.firstName} ${draft.lastName}\n` +
      `Email: ${draft.email}\n` +
      `Phone: +${formatPhone(phone)}\n\n` +
      `Tap *Create account* to finish.`,
    [
      { id: 'signup_confirm', title: 'Create account' },
      { id: 'signup_restart', title: 'Start over' },
    ]
  );
}

async function createSignupAccount(phone, draft) {
  await whatsapp.sendText(phone, '⏳ Creating your account…');
  const result = await signUp({
    phone,
    email: draft.email,
    password: draft.password,
    firstName: draft.firstName,
    lastName: draft.lastName,
  });

  if (!result.ok) {
    await whatsapp.sendText(phone, `❌ *${result.message}*`);
    return null;
  }

  const name = formatName(result.user);
  await whatsapp.sendText(
    phone,
    `✅ *Account created!*\n\nWelcome to Mysogi, *${name}*! 🎉\n\nYour account works across all services.`
  );
  return { step: 'super_menu', data: { authMode: 'authenticated', userEmail: result.user.email } };
}

async function handleLoginEmail(phone, text, data) {
  const input = text.trim();

  // email | password in one line
  if (input.includes('|')) {
    const [email, password] = input.split('|').map((s) => s.trim());
    if (!isValidEmail(email)) {
      await whatsapp.sendText(phone, 'Invalid email. Try again or type *login*.');
      return null;
    }
    if (!password) {
      await whatsapp.sendText(phone, 'Enter password after email: email | password');
      return null;
    }
    return completeLogin(phone, email, password, data);
  }

  if (!isValidEmail(input)) {
    await whatsapp.sendText(phone, 'That does not look like a valid email. Try again.');
    return null;
  }

  await whatsapp.sendText(phone, `Enter your *password* for *${input}*:`);
  return {
    step: 'auth_login_password',
    data: { ...data, loginEmail: input.toLowerCase() },
  };
}

async function handleLoginPassword(phone, text, data) {
  const password = text.trim();
  if (!password) {
    await whatsapp.sendText(phone, 'Enter your password.');
    return null;
  }
  return completeLogin(phone, data.loginEmail, password, data);
}

async function completeLogin(phone, email, password, data) {
  await whatsapp.sendText(phone, '⏳ Logging you in…');
  const result = await signIn({ phone, email, password });

  if (!result.ok) {
    await whatsapp.sendText(phone, `❌ *${result.message}*`);
    return null;
  }

  const name = formatName(result.user);
  await whatsapp.sendText(phone, `✅ *Welcome back, ${name}!*\n\nYou're logged in to Mysogi.`);
  return { step: 'super_menu', data: { authMode: 'authenticated', userEmail: result.user.email } };
}

async function handleSignupInput(phone, text, data, { buttonId = '', listId = '' } = {}) {
  const choice = buttonId || listId;

  if (choice === 'signup_restart') {
    return startSignup(phone);
  }

  if (data.signupStep === 'confirm') {
    if (choice === 'signup_confirm' && data.signupDraft) {
      return createSignupAccount(phone, data.signupDraft);
    }
    if (!choice) {
      await whatsapp.sendText(phone, 'Tap *Create account* above to confirm, or type *signup* to start over.');
    }
    return null;
  }

  const parsed = parseSignupBulk(text);
  if (!parsed.ok) {
    await whatsapp.sendText(phone, `❌ ${parsed.message}`);
    return null;
  }

  await showSignupConfirm(phone, parsed.data);
  return {
    step: 'auth_signup',
    data: {
      ...data,
      authMode: 'signup_pending',
      signupStep: 'confirm',
      signupDraft: parsed.data,
    },
  };
}

async function startOtpLogin(phone) {
  await whatsapp.sendText(
    phone,
    `*Login with email code*\n\nReply with your *email address*.\nWe'll send a 6-digit code.\n\n_Type *menu* or *cancel* to go back._`
  );
  return { step: 'auth_otp_email', data: { authMode: 'otp_pending' } };
}

async function handleOtpEmail(phone, text, data) {
  const email = text.trim();
  if (!isValidEmail(email)) {
    await whatsapp.sendText(phone, 'Enter a valid email address.');
    return null;
  }

  const result = await sendEmailOtp(email);
  if (!result.ok) {
    await whatsapp.sendText(phone, `❌ ${result.message}`);
    return null;
  }

  await whatsapp.sendText(
    phone,
    `📧 Code sent to *${result.email}*\n\nEnter the 6-digit code from your email.\n_Check spam if not received._`
  );
  return { step: 'auth_otp_code', data: { ...data, otpEmail: result.email } };
}

async function handleOtpCode(phone, text, data) {
  const code = text.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) {
    await whatsapp.sendText(phone, 'Enter the 6-digit code from your email.');
    return null;
  }

  const result = await verifyEmailOtp({ phone, email: data.otpEmail, token: code });
  if (!result.ok) {
    await whatsapp.sendText(phone, `❌ ${result.message}`);
    return null;
  }

  await whatsapp.sendText(phone, '✅ *Logged in!* Welcome to Mysogi.');
  return { step: 'super_menu', data: { authMode: 'authenticated' } };
}

module.exports = {
  showAuthWelcome,
  startGuest,
  startLogin,
  startSignup,
  startOtpLogin,
  handleLoginEmail,
  handleLoginPassword,
  handleSignupInput,
  handleOtpEmail,
  handleOtpCode,
  formatName,
  parseSignupBulk,
};
