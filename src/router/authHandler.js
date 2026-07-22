/**
 * Auth actions and step handlers — Supabase primary.
 */

const whatsapp = require('../whatsapp');
const { getSession, setSession } = require('../sessionStore');
const { getUser, isAuthenticated, isGuest } = require('../userStore');
const { showSuperAppMenu } = require('./superAppMenu');
const { isSupabaseReady, signOut, restoreUserByPhone } = require('../auth/supabaseAuth');
const supabaseFlow = require('../flows/supabaseAuthFlow');
const legacyFlow = require('../flows/authFlow');
const { normalizePhone } = require('../utils/phone');

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

const AUTH_IN_PROGRESS_STEPS = new Set([
  'auth_login_email',
  'auth_login_password',
  'auth_signup',
  'auth_otp_email',
  'auth_otp_code',
]);

const AUTH_CANCEL_WORDS = new Set(['cancel', 'stop', 'quit', 'exit', 'back']);

function isAuthInterrupt(text) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return false;
  if (AUTH_CANCEL_WORDS.has(t)) return true;
  if (['menu', 'start', 'hi', 'hello', 'help', '0', 'home', 'hey', 'hiya', 'howdy'].includes(t)) return true;
  if (/^good\s+(morning|afternoon|evening)$/i.test(t)) return true;
  return /^(hi|hello|hey)[\s,!?.]*$/i.test(t);
}

async function interruptAuthFlow(phone, text) {
  const cancelled = AUTH_CANCEL_WORDS.has((text || '').trim().toLowerCase());
  if (cancelled) {
    await whatsapp.sendText(phone, '✅ Cancelled.');
  }

  if (isAuthenticated(phone) || isGuest(phone)) {
    await showSuperAppMenu(phone);
    setSession(phone, {
      step: 'super_menu',
      activeService: null,
      data: { authMode: isAuthenticated(phone) ? 'authenticated' : 'guest' },
    });
    return;
  }

  const next = await supabaseFlow.showAuthWelcome(phone);
  setSession(phone, { step: next.step, activeService: null, data: next.data });
}

async function applyAuthStepResult(phone, next) {
  if (!next) return;
  setSession(phone, {
    step: next.step,
    activeService: null,
    data: next.data || {},
  });
  if (next.step === 'super_menu') {
    await showSuperAppMenu(phone, { offerTopUp: true });
  }
}

async function promptLoginRequired(phone) {
  const normalizedPhone = normalizePhone(phone);
  // Single welcome + buttons (avoid duplicate “choose how to continue” spam)
  const next = await supabaseFlow.showAuthWelcome(normalizedPhone);
  setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
}

async function handleAuthSteps(phone, message, session) {
  const normalizedPhone = normalizePhone(phone);
  const text = message.text?.body || '';
  const buttonId = message.interactive?.button_reply?.id || '';
  const listId = message.interactive?.list_reply?.id || '';
  const choice = buttonId || listId;
  const data = session.data || {};

  if (AUTH_IN_PROGRESS_STEPS.has(session.step) && !choice && isAuthInterrupt(text)) {
    await interruptAuthFlow(normalizedPhone, text);
    return true;
  }

  if (useSupabaseAuth()) {
    if (choice === 'auth_guest') {
      const next = await supabaseFlow.startGuest(normalizedPhone);
      setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
      return true;
    }
    if (choice === 'auth_login' && session.step === 'auth_welcome') {
      const next = await supabaseFlow.startLogin(normalizedPhone);
      setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
      return true;
    }
    if (choice === 'auth_signup' && session.step === 'auth_welcome') {
      const next = await supabaseFlow.startSignup(normalizedPhone);
      setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
      return true;
    }
    if (choice === 'auth_otp' || (choice === 'auth_login' && session.step !== 'auth_welcome')) {
      const next = await supabaseFlow.startOtpLogin(normalizedPhone);
      setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
      return true;
    }

    if (session.step === 'auth_login_email') {
      const next = await supabaseFlow.handleLoginEmail(normalizedPhone, text, data);
      await applyAuthStepResult(normalizedPhone, next);
      return true;
    }

    if (session.step === 'auth_login_password') {
      const next = await supabaseFlow.handleLoginPassword(normalizedPhone, text, data);
      await applyAuthStepResult(normalizedPhone, next);
      return true;
    }

    if (session.step === 'auth_signup') {
      const next = await supabaseFlow.handleSignupInput(normalizedPhone, text, data, {
        buttonId,
        listId,
      });
      await applyAuthStepResult(normalizedPhone, next);
      return true;
    }

    if (session.step === 'auth_otp_email') {
      const next = await supabaseFlow.handleOtpEmail(normalizedPhone, text, data);
      if (next) setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
      return true;
    }

    if (session.step === 'auth_otp_code') {
      const next = await supabaseFlow.handleOtpCode(normalizedPhone, text, data);
      await applyAuthStepResult(normalizedPhone, next);
      return true;
    }
  }

  // Legacy Bygate OTP fallback
  if (session.step === 'auth_otp_email') {
    const next = await legacyFlow.handleOtpEmail(normalizedPhone, text, data);
    if (next) setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
    return true;
  }
  if (session.step === 'auth_otp_code') {
    const next = await legacyFlow.handleOtpCode(normalizedPhone, text, data);
    if (next?.step === 'main_menu') await showSuperAppMenu(normalizedPhone);
    else if (next) setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
    return true;
  }
  if (session.step === 'auth_signup') {
    const next = await legacyFlow.handleSignupInput(
      normalizedPhone,
      { text, buttonId, listId },
      data
    );
    if (next) {
      if (next.step === 'main_menu') await showSuperAppMenu(normalizedPhone);
      else setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
    }
    return true;
  }

  return false;
}

async function handleAuthAction(phone, action) {
  const normalizedPhone = normalizePhone(phone);
  switch (action) {
    case 'auth_guest': {
      const next = await supabaseFlow.startGuest(normalizedPhone);
      setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
      return true;
    }
    case 'auth_login': {
      if (useSupabaseAuth()) {
        const next = await supabaseFlow.startLogin(normalizedPhone);
        setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
      } else {
        const next = await legacyFlow.startOtpLogin(normalizedPhone);
        setSession(normalizedPhone, { step: 'auth_otp_email', activeService: null, data: next.data });
      }
      return true;
    }
    case 'auth_signup': {
      if (useSupabaseAuth()) {
        const next = await supabaseFlow.startSignup(normalizedPhone);
        setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
      } else {
        const next = await legacyFlow.startSignup(normalizedPhone);
        setSession(normalizedPhone, { step: 'auth_signup', activeService: null, data: next.data });
      }
      return true;
    }
    case 'auth_logout': {
      if (useSupabaseAuth()) await signOut(normalizedPhone);
      else {
        const { setUser } = require('../userStore');
        setUser(normalizedPhone, {
          authMode: 'guest',
          email: null,
          mysogiToken: null,
          firstName: null,
          lastName: null,
        });
      }
      await whatsapp.sendText(normalizedPhone, '✅ Logged out. Type *hi* to log in again.');
      const next = await supabaseFlow.showAuthWelcome(normalizedPhone);
      setSession(normalizedPhone, { step: next.step, activeService: null, data: next.data });
      return true;
    }
    case 'auth_profile': {
      const user = getUser(normalizedPhone);
      await whatsapp.sendText(
        normalizedPhone,
        `*Your Bygate profile*\n\n` +
          `Name: ${[user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—'}\n` +
          `Email: ${user?.email || '—'}\n` +
          `Phone: +${normalizedPhone.replace(/^\+/, '')}\n` +
          `KYC Level: ${user?.kycLevel || 0}\n` +
          `Wallet: ₦${Number(user?.walletBalance || 0).toLocaleString('en-NG')}`
      );
      await showSuperAppMenu(normalizedPhone);
      return true;
    }
    default:
      return false;
  }
}

function requiresAuth(phone) {
  return !isAuthenticated(phone) && !isGuest(phone);
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
