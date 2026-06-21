/**
 * Auth actions and step handlers — Supabase primary.
 */

const whatsapp = require('../whatsapp');
const { getSession, setSession } = require('../sessionStore');
const { getUser, isAuthenticated } = require('../userStore');
const { showSuperAppMenu } = require('./superAppMenu');
const { isSupabaseReady, signOut, restoreUserByPhone } = require('../auth/supabaseAuth');
const supabaseFlow = require('../flows/supabaseAuthFlow');
const legacyFlow = require('../flows/authFlow');

const AUTH_STEPS = new Set([
  'auth_welcome',
  'auth_login_email',
  'auth_login_password',
  'auth_signup',
  'auth_otp_email',
  'auth_otp_code',
  'auth_gate',
]);

function useSupabaseAuth() {
  return isSupabaseReady();
}

async function promptLoginRequired(phone) {
  await whatsapp.sendText(
    phone,
    '🔐 *Login required*\n\nCreate an account or log in to use Mysogi services.'
  );
  const next = await supabaseFlow.showAuthWelcome(phone);
  setSession(phone, { step: next.step, activeService: null, data: next.data });
}

async function handleAuthSteps(phone, message, session) {
  const text = message.text?.body || '';
  const buttonId = message.interactive?.button_reply?.id || '';
  const listId = message.interactive?.list_reply?.id || '';
  const choice = buttonId || listId;
  const data = session.data || {};

  if (useSupabaseAuth()) {
    if (choice === 'auth_login' && session.step === 'auth_welcome') {
      const next = await supabaseFlow.startLogin(phone);
      setSession(phone, { step: next.step, activeService: null, data: next.data });
      return true;
    }
    if (choice === 'auth_signup' && session.step === 'auth_welcome') {
      const next = await supabaseFlow.startSignup(phone);
      setSession(phone, { step: next.step, activeService: null, data: next.data });
      return true;
    }
    if (choice === 'auth_otp' || (choice === 'auth_login' && session.step !== 'auth_welcome')) {
      const next = await supabaseFlow.startOtpLogin(phone);
      setSession(phone, { step: next.step, activeService: null, data: next.data });
      return true;
    }

    if (session.step === 'auth_login_email') {
      const next = await supabaseFlow.handleLoginEmail(phone, text, data);
      if (next) {
        if (next.step === 'super_menu') await showSuperAppMenu(phone, { offerTopUp: true });
        else setSession(phone, { step: next.step, activeService: null, data: next.data });
      }
      return true;
    }

    if (session.step === 'auth_login_password') {
      const next = await supabaseFlow.handleLoginPassword(phone, text, data);
      if (next) await showSuperAppMenu(phone, { offerTopUp: true });
      return true;
    }

    if (session.step === 'auth_signup') {
      const next = await supabaseFlow.handleSignupInput(phone, text, data);
      if (next) await showSuperAppMenu(phone, { offerTopUp: true });
      return true;
    }

    if (session.step === 'auth_otp_email') {
      const next = await supabaseFlow.handleOtpEmail(phone, text, data);
      if (next) setSession(phone, { step: next.step, activeService: null, data: next.data });
      return true;
    }

    if (session.step === 'auth_otp_code') {
      const next = await supabaseFlow.handleOtpCode(phone, text, data);
      if (next) await showSuperAppMenu(phone, { offerTopUp: true });
      return true;
    }
  }

  // Legacy Mysogi OTP fallback
  if (session.step === 'auth_otp_email') {
    const next = await legacyFlow.handleOtpEmail(phone, text, data);
    if (next) setSession(phone, { step: next.step, activeService: null, data: next.data });
    return true;
  }
  if (session.step === 'auth_otp_code') {
    const next = await legacyFlow.handleOtpCode(phone, text, data);
    if (next) await showSuperAppMenu(phone);
    return true;
  }
  if (session.step === 'auth_signup') {
    const next = await legacyFlow.handleSignupInput(phone, { text, buttonId, listId }, data);
    if (next) {
      if (next.step === 'main_menu') await showSuperAppMenu(phone);
      else setSession(phone, { step: next.step, activeService: null, data: next.data });
    }
    return true;
  }

  return false;
}

async function handleAuthAction(phone, action) {
  switch (action) {
    case 'auth_login': {
      if (useSupabaseAuth()) {
        const next = await supabaseFlow.startLogin(phone);
        setSession(phone, { step: next.step, activeService: null, data: next.data });
      } else {
        const next = await legacyFlow.startOtpLogin(phone);
        setSession(phone, { step: 'auth_otp_email', activeService: null, data: next.data });
      }
      return true;
    }
    case 'auth_signup': {
      if (useSupabaseAuth()) {
        const next = await supabaseFlow.startSignup(phone);
        setSession(phone, { step: next.step, activeService: null, data: next.data });
      } else {
        const next = await legacyFlow.startSignup(phone);
        setSession(phone, { step: 'auth_signup', activeService: null, data: next.data });
      }
      return true;
    }
    case 'auth_logout': {
      if (useSupabaseAuth()) await signOut(phone);
      else {
        const { setUser } = require('../userStore');
        setUser(phone, { authMode: 'guest', email: null, mysogiToken: null, firstName: null, lastName: null });
      }
      await whatsapp.sendText(phone, '✅ Logged out. Type *hi* to log in again.');
      const next = await supabaseFlow.showAuthWelcome(phone);
      setSession(phone, { step: next.step, activeService: null, data: next.data });
      return true;
    }
    case 'auth_profile': {
      const user = getUser(phone);
      await whatsapp.sendText(
        phone,
        `*Your Mysogi profile*\n\n` +
          `Name: ${[user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—'}\n` +
          `Email: ${user?.email || '—'}\n` +
          `Phone: +${phone.replace(/^\+/, '')}\n` +
          `KYC Level: ${user?.kycLevel || 0}\n` +
          `Wallet: ₦${Number(user?.walletBalance || 0).toLocaleString('en-NG')}`
      );
      await showSuperAppMenu(phone);
      return true;
    }
    default:
      return false;
  }
}

function requiresAuth(phone) {
  return !isAuthenticated(phone);
}

module.exports = {
  handleAuthAction,
  handleAuthSteps,
  promptLoginRequired,
  requiresAuth,
  AUTH_STEPS,
  useSupabaseAuth,
  restoreUserByPhone,
};
