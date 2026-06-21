/**
 * WhatsApp auth flow — Supabase signup & login.
 */

const whatsapp = require('../whatsapp');
const {
  isValidEmail,
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

async function showAuthWelcome(phone) {
  await whatsapp.sendText(
    phone,
    `*Welcome to Mysogi* 🌍\n\n` +
      `Africa's WhatsApp Super App — banking, bills, food, shopping, loans, travel, AI & more.\n\n` +
      `*Create an account* or *log in* to get started.\n` +
      `_Your WhatsApp number: +${formatPhone(phone)}_`
  );

  await whatsapp.sendButtons(phone, 'How would you like to continue?', [
    { id: 'auth_login', title: '🔐 Log in' },
    { id: 'auth_signup', title: '✨ Sign up' },
  ]);

  return { step: 'auth_welcome', data: { authMode: 'pending' } };
}

async function startLogin(phone) {
  await whatsapp.sendText(
    phone,
    `*Log in to Mysogi*\n\n` +
      `Reply with your *email address*.\n\n` +
      `_Or send: email | password (one line)_\n` +
      `_Type *menu* to cancel._`
  );
  return { step: 'auth_login_email', data: { authMode: 'login_pending' } };
}

async function startSignup(phone) {
  await whatsapp.sendText(
    phone,
    `*Create your Mysogi account*\n\n` +
      `Send all details in *one line*, separated by *|*\n\n` +
      `*Format:*\nFirst name | Last name | Email | Password\n\n` +
      `*Example:*\nAda | Okafor | ada@email.com | mypass123\n\n` +
      `Phone: *+${formatPhone(phone)}* (from WhatsApp)\n` +
      `_Password: min 6 characters. Type *menu* to cancel._`
  );
  return { step: 'auth_signup', data: { authMode: 'signup_pending' } };
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

async function handleSignupInput(phone, text, data) {
  if (!text || !text.includes('|')) {
    await whatsapp.sendText(phone, 'Use the format:\nFirst | Last | Email | Password');
    return null;
  }

  const parts = text.split('|').map((p) => p.trim());
  if (parts.length < 4) {
    await whatsapp.sendText(phone, 'Need 4 parts: First | Last | Email | Password');
    return null;
  }

  const [firstName, lastName, email, password] = parts;

  if (!isValidEmail(email)) {
    await whatsapp.sendText(phone, 'Invalid email address.');
    return null;
  }

  await whatsapp.sendText(phone, '⏳ Creating your account…');
  const result = await signUp({ phone, email, password, firstName, lastName });

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

async function startOtpLogin(phone) {
  await whatsapp.sendText(
    phone,
    `*Login with email code*\n\nReply with your *email address*.\nWe'll send a 6-digit code.\n\n_Type *menu* to cancel._`
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
  startLogin,
  startSignup,
  startOtpLogin,
  handleLoginEmail,
  handleLoginPassword,
  handleSignupInput,
  handleOtpEmail,
  handleOtpCode,
  formatName,
};
