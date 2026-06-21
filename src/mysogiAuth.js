const axios = require('axios');
const config = require('./config');
const { createOtp, verifyOtp } = require('./otpStore');
const { sendOtpEmail } = require('./emailService');

const API = (config.mysogi.apiBaseUrl || 'https://api.mysogi.com.ng').replace(/\/$/, '');

function parseApiBody(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

async function postAuth(path, body) {
  try {
    const { data, status } = await axios.post(`${API}${path}`, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
      validateStatus: () => true,
    });
    const parsed = parseApiBody(data);
    if (status >= 500) {
      return { ok: false, message: 'Mysogi server busy. Try again in a moment.' };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, message: 'Unexpected response from Mysogi.' };
    }
    if (parsed.status === 'success') {
      return { ok: true, data: parsed.data, message: parsed.message };
    }
    const errors = parsed.errors ? Object.values(parsed.errors).join('. ') : '';
    return { ok: false, message: errors || parsed.message || 'Request failed.' };
  } catch (err) {
    return { ok: false, message: err.message || 'Could not reach Mysogi.' };
  }
}

function normalizeUser(user, fallbackEmail = '') {
  const email = (user?.email || fallbackEmail || '').trim().toLowerCase();
  const firstName = user?.firstName || user?.first_name || '';
  const lastName = user?.lastName || user?.last_name || '';
  const username =
    user?.username || user?.userName || user?.user_name || (email ? email.split('@')[0] : '');

  return {
    id: user?.id,
    email,
    firstName,
    lastName,
    username,
    phone: user?.phone,
  };
}

async function login(email, password) {
  const result = await postAuth('/api/auth/login', {
    username: email.trim(),
    password,
  });
  if (!result.ok) return result;

  const token =
    result.data?.token ||
    result.data?.accessToken ||
    result.data?.jwt ||
    result.data?.user?.token;
  const user = result.data?.user || result.data;

  return {
    ok: true,
    token,
    user: normalizeUser(user, email),
    message: 'Login successful',
  };
}

async function registerIndividual({ firstName, lastName, email, password, phone }) {
  return postAuth('/api/auth/register', {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
    password,
    phone: String(phone).replace(/\D/g, ''),
    userType: 'individual',
  });
}

async function registerBusiness({
  firstName,
  lastName,
  email,
  password,
  phone,
  businessName,
  businessEmail,
  contactName,
}) {
  return postAuth('/api/auth/register', {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
    password,
    phone: String(phone).replace(/\D/g, ''),
    userType: 'business',
    businessName: businessName.trim(),
    businessEmail: (businessEmail || email).trim(),
    contactName: (contactName || `${firstName} ${lastName}`).trim(),
  });
}

async function signup(payload, phone) {
  const { firstName, lastName, email, password, userType } = payload;
  if (!email?.includes('@') || !password || password.length < 6) {
    return { ok: false, message: 'Valid email and password (6+ chars) required.' };
  }

  let reg;
  if (userType === 'business') {
    reg = await registerBusiness({
      firstName,
      lastName,
      email,
      password,
      phone,
      businessName: payload.businessName || `${firstName} ${lastName}`,
      businessEmail: payload.businessEmail || email,
      contactName: payload.contactName || `${firstName} ${lastName}`,
    });
  } else {
    reg = await registerIndividual({ firstName, lastName, email, password, phone });
  }

  if (!reg.ok) return reg;

  const loginResult = await login(email, password);
  if (loginResult.ok) return { ...loginResult, message: 'Account created. You are logged in.' };

  return {
    ok: true,
    token: null,
    user: normalizeUser(reg.data?.user || { email, firstName, lastName }, email),
    message: 'Account created. Please log in.',
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

async function tryMysogiOtp(path, body) {
  if (!config.mysogi.apiKey) return null;
  try {
    const { data, status } = await axios.post(`${API}${path}`, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.mysogi.apiKey}`,
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (status < 200 || status >= 300) return null;
    const parsed = parseApiBody(data);
    if (!parsed || parsed.status !== 'success') return null;
    return parsed.data;
  } catch {
    return null;
  }
}

async function requestLoginOtp(email, phone) {
  const trimmed = email.trim().toLowerCase();
  if (!isValidEmail(trimmed)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }

  const apiData = await tryMysogiOtp('/api/auth/send-otp', { email: trimmed, channel: 'email' });
  if (apiData) {
    return { ok: true, email: trimmed, viaApi: true };
  }

  const otp = createOtp(phone, trimmed);
  if (!otp.ok) return otp;

  const sent = await sendOtpEmail(trimmed, otp.code);
  if (!sent.ok) return sent;

  return {
    ok: true,
    email: trimmed,
    devMode: sent.devMode,
    code: sent.devMode ? otp.code : undefined,
    expiresInMinutes: otp.expiresInMinutes,
  };
}

async function verifyLoginOtp(email, code, phone) {
  const trimmed = email.trim().toLowerCase();
  const cleaned = String(code).replace(/\s/g, '');

  const apiData = await tryMysogiOtp('/api/auth/verify-otp', { email: trimmed, otp: cleaned });
  if (apiData) {
    const user = apiData.user || apiData;
    return {
      ok: true,
      token: apiData.token || apiData.accessToken || apiData.jwt,
      user: normalizeUser(user, trimmed),
      message: 'Login successful',
    };
  }

  const check = verifyOtp(phone, trimmed, cleaned);
  if (!check.ok) return check;

  return {
    ok: true,
    token: null,
    user: normalizeUser({ email: trimmed }, trimmed),
    message: 'Email verified — you are logged in.',
  };
}

module.exports = {
  login,
  signup,
  registerIndividual,
  requestLoginOtp,
  verifyLoginOtp,
  isValidEmail,
};
