require('dotenv').config();

const required = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN'];

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`Warning: ${key} is not set. Copy .env.example to .env and fill in values.`);
  }
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  adminNumber: process.env.ADMIN_WHATSAPP_NUMBER || '',
  publicBaseUrl: (
    process.env.PUBLIC_BASE_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  ).trim(),

  whatsapp: {
    token: (process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
    phoneNumberId: (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
    verifyToken: (process.env.WHATSAPP_VERIFY_TOKEN || '').trim(),
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    flowLoginId: process.env.WHATSAPP_FLOW_LOGIN_ID || '',
    flowSignupId: process.env.WHATSAPP_FLOW_SIGNUP_ID || '',
    flowPinSetId: process.env.WHATSAPP_FLOW_PIN_SET_ID || '',
    flowPinVerifyId: process.env.WHATSAPP_FLOW_PIN_VERIFY_ID || '',
  },

  supabase: {
    url: (process.env.SUPABASE_URL || '').trim(),
    anonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  },

  openai: {
    apiKey: (process.env.OPENAI_API_KEY || '').trim(),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },

  mysogi: {
    apiBaseUrl: process.env.MYSOGI_API_BASE_URL || 'https://api.mysogi.com.ng',
    apiKey: process.env.MYSOGI_API_KEY || '',
    website: 'https://mysogi.com.ng',
  },

  payments: {
    paystack: {
      secretKey: (process.env.PAYSTACK_SECRET_KEY || '').trim(),
      publicKey: (process.env.PAYSTACK_PUBLIC_KEY || '').trim(),
    },
    flutterwave: {
      secretKey: (process.env.FLUTTERWAVE_SECRET_KEY || '').trim(),
      publicKey: (process.env.FLUTTERWAVE_PUBLIC_KEY || '').trim(),
    },
  },

  bills: {
    provider: (process.env.BILLS_PROVIDER || 'vtpass').trim().toLowerCase(), // vtpass | erightvtu
    vtpass: {
      apiKey: (process.env.VTPASS_API_KEY || '').trim(),
      publicKey: (process.env.VTPASS_PUBLIC_KEY || '').trim(),
      secretKey: (process.env.VTPASS_SECRET_KEY || '').trim(),
      sandbox: process.env.VTPASS_SANDBOX !== 'false',
    },
    erightvtu: {
      apiKey: (process.env.ERIGHT_VTU_API_KEY || '').trim(),
      apiPin: (process.env.ERIGHT_VTU_API_PIN || '0000').trim(),
      baseUrl: (process.env.ERIGHT_VTU_BASE_URL || 'https://sabuss.com/vtu/api').trim(),
      billPlans: (() => {
        try {
          return JSON.parse(process.env.ERIGHT_VTU_BILL_PLANS || '{}');
        } catch {
          return {};
        }
      })(),
    },
  },

  banking: {
    provider: process.env.BANKING_PROVIDER || 'paystack', // paystack | mono | anchor
    mono: {
      secretKey: (process.env.MONO_SECRET_KEY || '').trim(),
    },
    anchor: {
      apiKey: (process.env.ANCHOR_API_KEY || '').trim(),
    },
  },

  airtime: {
    provider: process.env.AIRTIME_PROVIDER || 'vtpass', // vtpass | budpay
  },

  delivery: {
    provider: process.env.DELIVERY_PROVIDER || 'internal', // chowdeck | gokada | internal
    chowdeck: { apiKey: (process.env.CHOWDECK_API_KEY || '').trim() },
  },

  loans: {
    provider: process.env.LOANS_PROVIDER || 'mysogi', // mysogi | carbon | fairmoney
  },

  credit: {
    enabled: process.env.FEATURE_CREDIT !== 'false',
    minScore: Number(process.env.CREDIT_MIN_SCORE) || 250,
    maxSinglePurchase: Number(process.env.CREDIT_MAX_SINGLE) || 5000,
    interestPercent: Number(process.env.CREDIT_FEE_PERCENT) || 5,
    repaymentDays: Number(process.env.CREDIT_REPAYMENT_DAYS) || 7,
    autoRepayOnTopUp: process.env.CREDIT_AUTO_REPAY !== 'false',
  },

  travel: {
    provider: process.env.TRAVEL_PROVIDER || 'wakanow', // wakanow | travelstart
    wakanow: { apiKey: (process.env.WAKANOW_API_KEY || '').trim() },
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
  },

  otp: {
    devMode: process.env.OTP_DEV_MODE === 'true',
    expiryMinutes: 5,
  },

  features: {
    aiAssistant: process.env.FEATURE_AI_ASSISTANT !== 'false',
    naturalLanguage: process.env.FEATURE_NATURAL_LANGUAGE !== 'false',
  },

  wallet: {
    commissionPercent: Number(process.env.MYSOGI_COMMISSION_PERCENT) || 2.5,
    minTopUp: Number(process.env.WALLET_MIN_TOPUP) || 100,
  },

  security: {
    pinRequired: process.env.PIN_REQUIRED !== 'false',
    pinEntryMode: process.env.PIN_ENTRY_MODE || 'web', // web only (secure portal)
    pinTokenSecret: process.env.PIN_TOKEN_SECRET || '',
    pinPortalTtlMinutes: Number(process.env.PIN_PORTAL_TTL_MINUTES) || 15,
    pinLength: Number(process.env.PIN_LENGTH) || 4,
    maxPinAttempts: Number(process.env.PIN_MAX_ATTEMPTS) || 5,
    pinLockoutMinutes: Number(process.env.PIN_LOCKOUT_MINUTES) || 15,
  },
};
