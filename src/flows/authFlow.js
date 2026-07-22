const whatsapp = require('../whatsapp');
const { buildUrl, BASE } = require('../mysogiLinks');
const { getUser, setUser, isAuthenticated } = require('../userStore');
const { requestLoginOtp, verifyLoginOtp, isValidEmail, signup } = require('../mysogiAuth');

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return phone;
  return digits.startsWith('234') ? `+${digits}` : `+${digits}`;
}

function isValidName(name) {
  return (name || '').trim().length >= 2;
}

function formatDisplayName(user) {
  if (!user) return 'there';
  const first = (user.firstName || '').trim();
  const last = (user.lastName || '').trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  const username = (user.username || '').trim();
  if (username) return username;
  const email = (user.email || '').trim();
  if (email.includes('@')) return email.split('@')[0];
  return 'there';
}

function formatAuthLabel(user) {
  const name = formatDisplayName(user);
  const email = user?.email;
  if (!email) return `Logged in as *${name}*`;
  if (name && name !== email.split('@')[0]) {
    return `Logged in as *${name}* · ${email}`;
  }
  return `Logged in as *${email}*`;
}

async function showWelcomeAuth(to) {
  if (isAuthenticated(to)) {
    const user = getUser(to);
    const name = formatDisplayName(user);
    await whatsapp.sendText(
      to,
      `*Welcome back, ${name}!* 👋\n\n` +
        `You're signed in to Bygate.\n` +
        `_${user.email || 'Your account is linked'}_`
    );
    return showAppMenu(to, {
      authMode: 'authenticated',
      userEmail: user.email,
      mysogiToken: user.mysogiToken,
    });
  }

  const website = buildUrl('home', to);
  await whatsapp.sendText(
    to,
    `*Welcome to Bygate Ads* 🎯\n\n` +
      `Advertise. Connect. Convert.\n\n` +
      `🌐 *Visit us:* ${BASE}\n${website}\n\n` +
      `Log in with email OTP or *create an account* right here in chat.\n` +
      `_Same account as mysogi.com.ng_`
  );

  await whatsapp.sendButtons(to, 'How would you like to continue?', [
    { id: 'auth_login', title: 'Login with OTP' },
    { id: 'auth_guest', title: 'Continue as guest' },
  ]);

  await whatsapp.sendButtons(to, 'New to Bygate?', [
    { id: 'auth_signup', title: 'Create account' },
  ]);

  return { step: 'auth_gate', data: { authMode: 'pending' } };
}

async function startOtpLogin(to) {
  await whatsapp.sendText(
    to,
    `*Login*\n\n` +
      `Reply with your Bygate *email address*.\n\n` +
      `We will send a 6-digit code to that email.\n` +
      `_Type *menu* to cancel._`
  );
  return { step: 'auth_otp_email', data: { authMode: 'otp_pending' } };
}

async function openLoginForm(to) {
  return startOtpLogin(to);
}

async function startSignup(to) {
  await whatsapp.sendText(
    to,
    `*Create Bygate account* (one message)\n\n` +
      `Send *all details in one line*, separated by *|*\n\n` +
      `*Format:*\n` +
      `First name | Last name | Email | Password | individual OR business | Business name\n\n` +
      `*Individual example:*\n` +
      `Ada | Okafor | ada@email.com | mypass12 | individual\n\n` +
      `*Business example:*\n` +
      `Ada | Okafor | ada@email.com | mypass12 | business | Ada Stores\n\n` +
      `Phone: *${formatPhone(to)}* (from WhatsApp)\n` +
      `_Type *menu* to cancel._`
  );
  return {
    step: 'auth_signup',
    data: { authMode: 'signup_pending', signup: {}, signupStep: 'bulk' },
  };
}

async function openSignupForm(to) {
  return startSignup(to);
}

function parseBulkSignup(text) {
  const parts = text
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length < 5) {
    return {
      ok: false,
      message:
        'Send all fields in *one line* separated by |\n\n' +
        'Example:\nAda | Okafor | ada@email.com | mypass12 | individual',
    };
  }

  const [firstName, lastName, email, password, userTypeRaw, businessName] = parts;
  const userType = normalizeSignupType(userTypeRaw);

  if (!isValidName(firstName) || !isValidName(lastName)) {
    return { ok: false, message: 'First and last name must be at least 2 characters each.' };
  }
  if (!isValidEmail(email)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  if (!password || password.length < 6) {
    return { ok: false, message: 'Password must be at least 6 characters.' };
  }
  if (!userType) {
    return { ok: false, message: 'Account type must be *individual* or *business*.' };
  }
  if (userType === 'business' && !isValidName(businessName || '')) {
    return {
      ok: false,
      message: 'Business accounts need a business name as the 6th field.\n\n' +
        'Ada | Okafor | ada@email.com | mypass12 | business | Ada Stores',
    };
  }

  return {
    ok: true,
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      password,
      userType,
      businessName: userType === 'business' ? businessName.trim() : undefined,
    },
  };
}

async function showSignupConfirm(to, signupData, phone) {
  const lines = [
    `*Confirm your account*`,
    '',
    `*Name:* ${signupData.firstName} ${signupData.lastName}`,
    `*Email:* ${signupData.email}`,
    `*Type:* ${signupData.userType === 'business' ? 'Business' : 'Individual'}`,
    `*Phone:* ${formatPhone(phone)}`,
  ];
  if (signupData.userType === 'business') {
    lines.push(`*Business name:* ${signupData.businessName}`);
  }
  lines.push('', 'Tap *Create account* to finish, or *Start over*.');

  await whatsapp.sendButtons(to, lines.join('\n'), [
    { id: 'signup_confirm', title: 'Create account' },
    { id: 'signup_restart', title: 'Start over' },
  ]);
}

async function handleSignupInput(to, input, data = {}) {
  const signupData = { ...(data.signup || {}) };
  const step = data.signupStep;
  const text = (input.text || '').trim();
  const buttonId = input.buttonId || '';
  const listId = input.listId || '';

  if (buttonId === 'signup_restart' || listId === 'signup_restart') {
    return startSignup(to);
  }

  if (step === 'confirm') {
    if (buttonId === 'signup_confirm' || listId === 'signup_confirm') {
      await whatsapp.sendText(to, '⏳ Creating your account…');
      const result = await signup(
        {
          firstName: signupData.firstName,
          lastName: signupData.lastName,
          email: signupData.email,
          password: signupData.password,
          userType: signupData.userType,
          businessName: signupData.businessName,
          businessEmail: signupData.email,
          contactName: `${signupData.firstName} ${signupData.lastName}`,
        },
        to
      );
      if (!result.ok) {
        await whatsapp.sendText(
          to,
          `❌ *${result.message}*\n\nFix the issue and type *signup* to try again.`
        );
        return null;
      }
      return completeAuth(
        to,
        { ...result, message: 'Account created. You are logged in.' },
        { ...data, signup: undefined, signupStep: undefined }
      );
    }
    await whatsapp.sendText(to, 'Tap *Create account* above to confirm, or *Start over*.');
    return null;
  }

  if (step === 'bulk') {
    if (!text) {
      await whatsapp.sendText(to, 'Paste your details in one line (see format above), or type *signup* to see it again.');
      return null;
    }
    const parsed = parseBulkSignup(text);
    if (!parsed.ok) {
      await whatsapp.sendText(to, `❌ ${parsed.message}`);
      return null;
    }
    await showSignupConfirm(to, parsed.data, to);
    return {
      step: 'auth_signup',
      data: { ...data, signup: parsed.data, signupStep: 'confirm' },
    };
  }

  return startSignup(to);
}

function normalizeSignupType(text) {
  const t = (text || '').trim().toLowerCase();
  if (t === 'individual' || t === 'personal') return 'individual';
  if (t === 'business' || t === 'company') return 'business';
  return '';
}

async function handleOtpEmail(to, text, data = {}) {
  const email = text.trim();
  if (!isValidEmail(email)) {
    await whatsapp.sendText(to, 'That does not look like a valid email. Try again, or type *menu* to cancel.');
    return null;
  }

  const result = await requestLoginOtp(email, to);
  if (!result.ok) {
    await whatsapp.sendText(to, `❌ ${result.message}`);
    return null;
  }

  if (result.devMode && result.code) {
    await whatsapp.sendText(
      to,
      `📧 *[Dev mode]* Your code for *${result.email}* is: *${result.code}*\n\n` +
        `(Normally this is emailed. Set SMTP_* in .env for production.)\n\n` +
        `Enter the 6-digit code here. Expires in ${result.expiresInMinutes} min.`
    );
  } else {
    await whatsapp.sendText(
      to,
      `📧 Code sent to *${result.email}*\n\n` +
        `Enter the 6-digit code from your email.\n` +
        `_Expires in ${result.expiresInMinutes || 5} minutes. Type *menu* to cancel._`
    );
  }

  return {
    step: 'auth_otp_code',
    data: { ...data, otpEmail: result.email, authMode: 'otp_pending' },
  };
}

async function handleOtpCode(to, text, data = {}) {
  const code = text.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) {
    await whatsapp.sendText(to, 'Enter the *6-digit code* from your email, or type *login* to resend.');
    return null;
  }

  if (!data.otpEmail) {
    await whatsapp.sendText(to, 'Session expired. Type *login* to start again.');
    return null;
  }

  const result = await verifyLoginOtp(data.otpEmail, code, to);
  return completeAuth(to, result, data);
}

async function completeAuth(to, result, data = {}) {
  if (!result.ok) {
    await whatsapp.sendText(
      to,
      `❌ *${result.message}*\n\nTry again or type *login* for a new code.`
    );
    return null;
  }

  setUser(to, {
    authMode: 'authenticated',
    email: result.user?.email,
    firstName: result.user?.firstName,
    lastName: result.user?.lastName,
    username: result.user?.username,
    mysogiToken: result.token,
    userId: result.user?.id,
  });

  const name = formatDisplayName(result.user);
  const email = result.user?.email || '';
  const intro = result.message?.includes('created')
    ? `✅ *Account created & logged in!*\n\nWelcome to Bygate, *${name}*!`
    : `✅ *You are logged in!*\n\nWelcome back, *${name}*!`;
  const accountLine = email && name !== email.split('@')[0] ? `\n_${email}_` : '';
  await whatsapp.sendText(to, `${intro}${accountLine}\n\nType *menu* to create your first ad.`);

  return showAppMenu(to, {
    ...data,
    authMode: 'authenticated',
    userEmail: result.user?.email,
    mysogiToken: result.token,
  });
}

async function showAppMenu(to, data = {}) {
  const user = getUser(to);
  const loggedIn = isAuthenticated(to);
  const authLabel = loggedIn ? formatAuthLabel(user) : 'Guest — log in anytime';
  const menuTitle = loggedIn
    ? `*Bygate Ads*\n${authLabel}`
    : `*Bygate Ads*\n_${authLabel}_`;

  const rows = [
    { id: 'create', title: 'Create New Ad', description: 'Start a campaign' },
    { id: 'campaigns', title: 'My campaigns', description: 'View in WhatsApp' },
    { id: 'types', title: 'View ad types', description: 'Billboard, SMS…' },
  ];

  if (!loggedIn) {
    rows.push({ id: 'auth_login', title: 'Login', description: 'Email OTP' });
    rows.push({ id: 'auth_signup', title: 'Sign up', description: 'In chat' });
  } else {
    rows.push({ id: 'wallet', title: 'Wallet balance', description: 'View & top up' });
    rows.push({ id: 'dashboard', title: 'Open dashboard', description: 'mysogi.com.ng' });
    rows.push({ id: 'logout', title: 'Log out', description: 'Switch account' });
  }

  rows.push({ id: 'contact', title: 'Contact Bygate', description: 'Support' });

  await whatsapp.sendList(
    to,
    `${menuTitle}\n\nCreate an Ad Campaign — tap into our customer base.\n\nChoose an option:`,
    'Open menu',
    [{ title: loggedIn ? `Hi, ${formatDisplayName(user)}` : 'Menu', rows: rows.slice(0, 10) }]
  );

  return {
    step: 'main_menu',
    data: {
      ...data,
      authMode: loggedIn ? 'authenticated' : data.authMode || 'guest',
      userEmail: user?.email || data.userEmail,
      mysogiToken: user?.mysogiToken || data.mysogiToken,
    },
  };
}

async function openSiteLink(to, route, label) {
  await whatsapp.sendText(to, `*${label}*\n\n${buildUrl(route, to)}`);
}

module.exports = {
  showWelcomeAuth,
  showAppMenu,
  openLoginForm,
  openSignupForm,
  startSignup,
  startOtpLogin,
  handleOtpEmail,
  handleOtpCode,
  handleSignupInput,
  completeAuth,
  openSiteLink,
  isAuthenticated,
};
