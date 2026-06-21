/**
 * Super App main menu — Africa's WhatsApp Super App
 * WhatsApp limit: max 10 rows TOTAL per list message.
 */

const whatsapp = require('../whatsapp');
const { getSession, setSession } = require('../sessionStore');
const { getUser, isAuthenticated } = require('../userStore');
const { SERVICES, getService } = require('./serviceRegistry');
const wallet = require('../wallet/walletService');
const config = require('../config');
const partnerStore = require('../stores/partnerStore');

const SUPER_MENU_STEP = 'super_menu';

const PAGE1_IDS = ['wallet', 'loans', 'airtime', 'bills', 'partners', 'ai'];
const PAGE2_IDS = ['ads', 'banking', 'food', 'shopping', 'travel', 'business', 'healthcare', 'marketplace', 'education'];

function formatDisplayName(user) {
  if (!user) return 'there';
  const first = (user.firstName || '').trim();
  if (first) return first;
  const email = (user.email || '').trim();
  if (email.includes('@')) return email.split('@')[0];
  return 'there';
}

function buildRows(serviceIds) {
  return serviceIds
    .map((id) => getService(id))
    .filter(Boolean)
    .map((s) => s.menuRow());
}

async function showSuperAppMenu(phone, options = {}) {
  const user = getUser(phone);
  const loggedIn = isAuthenticated(phone);
  const name = formatDisplayName(user);
  const balance = loggedIn ? await wallet.getBalance(phone) : 0;

  const header = loggedIn
    ? `*Welcome, ${name}!* 🌍\n💳 Wallet: *${wallet.formatNaira(balance)}*`
    : `*Welcome to Mysogi* 🌍`;

  const rows = buildRows(PAGE1_IDS);

  if (loggedIn) {
    rows.push({ id: 'auth_profile', title: '👤 My profile', description: (user.email || 'Account').slice(0, 72) });
    rows.push({ id: 'auth_logout', title: '🚪 Log out', description: 'Sign out of account' });
    rows.push({ id: 'svc_more_menu', title: '➕ More services', description: 'All services & settings' });
  } else {
    rows.push({ id: 'auth_login', title: '🔐 Log in', description: 'Email & password' });
    rows.push({ id: 'auth_signup', title: '✨ Sign up', description: 'Create account' });
  }

  // Hard cap — WhatsApp rejects lists with >10 rows
  const safeRows = rows.slice(0, 10);

  await whatsapp.sendList(
    phone,
    `${header}\n\n*Just type your order* — e.g. *"get me MTN airtime 500"* or *"buy 2GB data"*\n\nOr tap a service below.`,
    'Open menu',
    [{ title: 'Mysogi services', rows: safeRows }]
  );

  setSession(phone, {
    step: SUPER_MENU_STEP,
    activeService: null,
    data: { authMode: loggedIn ? 'authenticated' : 'guest', menuPage: 1 },
  });

  if (loggedIn && options.offerTopUp && balance < 100) {
    await whatsapp.sendButtons(
      phone,
      '💡 *Top up your wallet* to buy airtime, pay bills & more.',
      [
        { id: 'wallet_topup_self', title: 'Top up for me' },
        { id: 'wallet_topup_other', title: 'For someone else' },
      ]
    );
  }

  if (loggedIn && config.credit?.enabled) {
    try {
      const creditScoring = require('../credit/creditScoring');
      const profile = await creditScoring.getProfile(phone);
      if (!profile.activated && profile.score >= (config.credit.minScore || 250)) {
        await whatsapp.sendButtons(
          phone,
          `⚡ *You're eligible for Mysogi Credit*\n\nScore: *${profile.score}* · Limit up to ${wallet.formatNaira(profile.credit_limit)}`,
          [
            { id: 'credit_activate', title: 'Activate credit' },
            { id: 'svc_loans', title: 'Learn more' },
          ]
        );
      }
    } catch (_) {
      /* credit tables may not exist yet */
    }
  }
}

async function showMoreServicesMenu(phone) {
  const rows = [
    ...buildRows(PAGE2_IDS),
    { id: 'svc_agriculture', title: '🌾 Agriculture', description: 'Coming soon' },
    { id: 'svc_jobs', title: '💼 Jobs', description: 'Coming soon' },
    { id: 'auth_logout', title: '🚪 Log out', description: 'Switch account' },
    { id: 'svc_main_menu', title: '⬅️ Back', description: 'Main menu' },
  ].slice(0, 10);

  await whatsapp.sendList(
    phone,
    '*More services*\n\nSome features are coming soon.',
    'More options',
    [{ title: 'More', rows }]
  );

  setSession(phone, {
    step: SUPER_MENU_STEP,
    activeService: null,
    data: { authMode: 'authenticated', menuPage: 2 },
  });
}

function isSuperMenuStep(session) {
  return !session?.activeService && (session?.step === SUPER_MENU_STEP || session?.step === 'idle');
}

module.exports = { showSuperAppMenu, showMoreServicesMenu, isSuperMenuStep, SUPER_MENU_STEP, formatDisplayName };
