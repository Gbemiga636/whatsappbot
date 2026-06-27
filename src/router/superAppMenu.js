/**
 * Super App main menu — Africa's WhatsApp Super App
 * WhatsApp limit: max 10 rows TOTAL per list message.
 */

const whatsapp = require('../whatsapp');
const { getSession, setSession } = require('../sessionStore');
const { getUser, isAuthenticated } = require('../userStore');
const { getService } = require('./serviceRegistry');
const wallet = require('../wallet/walletService');

const SUPER_MENU_STEP = 'super_menu';

const MAIN_VTU_ROWS = [
  { id: 'menu_airtime', title: '💳 Airtime', description: 'MTN, Glo, Airtel, 9mobile' },
  { id: 'menu_data', title: '📶 Data', description: 'Daily, weekly & monthly bundles' },
  { id: 'menu_electric', title: '⚡ Electricity', description: 'All discos' },
  { id: 'menu_tv', title: '📺 TV subscription', description: 'DStv, GOtv, StarTimes' },
  { id: 'menu_betting', title: '🎰 Betting', description: 'Fund betting account' },
  { id: 'menu_food', title: '🍔 Order Food', description: 'Chowdeck — restaurants near you' },
];

const MORE_SERVICE_IDS = ['partners', 'ads', 'banking', 'shopping', 'travel'];

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

function buildMainMenuRows(loggedIn) {
  const rows = [...MAIN_VTU_ROWS];

  if (loggedIn) {
    rows.push({ id: 'auth_logout', title: '🚪 Log out', description: 'Sign out of account' });
    rows.push({ id: 'svc_wallet', title: '💳 My wallet', description: 'Balance & top-up' });
    rows.push({ id: 'svc_ai', title: '🤖 AI assistant', description: 'Ask anything' });
    rows.push({ id: 'svc_more_menu', title: '➕ More services', description: 'Ads, partners & more' });
  } else {
    rows.push({ id: 'auth_login', title: '🔐 Log in', description: 'Email & password' });
    rows.push({ id: 'auth_signup', title: '✨ Sign up', description: 'Create account' });
    rows.push({ id: 'svc_ai', title: '🤖 AI assistant', description: 'Ask anything' });
    rows.push({ id: 'svc_more_menu', title: '➕ More services', description: 'Browse what\'s available' });
  }

  return rows.slice(0, 10);
}

async function showSuperAppMenu(phone, options = {}) {
  const user = getUser(phone);
  const loggedIn = isAuthenticated(phone);
  const name = formatDisplayName(user);
  const balance = loggedIn ? await wallet.getBalance(phone) : 0;

  const header = loggedIn
    ? `*Welcome, ${name}!* 🌍\n💳 Wallet: *${wallet.formatNaira(balance)}*`
    : `*Welcome to Mysogi* 🌍`;

  const safeRows = buildMainMenuRows(loggedIn);

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
}

async function showMoreServicesMenu(phone) {
  const rows = [
    ...buildRows(MORE_SERVICE_IDS),
    { id: 'svc_education', title: '📚 Education', description: 'Coming soon' },
    { id: 'svc_healthcare', title: '🏥 Healthcare', description: 'Coming soon' },
    { id: 'svc_main_menu', title: '⬅️ Back', description: 'Main menu' },
  ].slice(0, 10);

  await whatsapp.sendList(
    phone,
    '*More services*\n\nPartners, ads, banking & more.',
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
