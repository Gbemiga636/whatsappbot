/**
 * Super App main menu — Africa's WhatsApp Super App
 * WhatsApp limit: max 10 rows TOTAL per list message.
 */

const whatsapp = require('../whatsapp');
const { getSession, setSession } = require('../sessionStore');
const { getUser, isAuthenticated, isGuest } = require('../userStore');
const { getService } = require('./serviceRegistry');
const wallet = require('../wallet/walletService');

const SUPER_MENU_STEP = 'super_menu';

const MAIN_VTU_ROWS = [
  { id: 'menu_airtime', title: '💳 Airtime', description: 'Top up · by saved name' },
  { id: 'menu_data', title: '📶 Data', description: 'Daily, weekly & monthly bundles' },
  { id: 'menu_bulk', title: '👥 Bulk airtime', description: 'Same airtime for many people' },
  { id: 'menu_contacts', title: '📇 Saved contacts', description: 'save contact Name 080…' },
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

function buildMainMenuRows(loggedIn, guest) {
  const rows = [...MAIN_VTU_ROWS];

  if (loggedIn) {
    rows.push({ id: 'svc_wallet', title: '💳 My wallet', description: 'Balance & top-up' });
    rows.push({ id: 'svc_ai', title: '🤖 AI assistant', description: 'Ask anything' });
    rows.push({ id: 'svc_more_menu', title: '➕ More services', description: 'Ads, partners & more' });
    rows.push({ id: 'auth_logout', title: '🚪 Log out', description: 'Sign out of account' });
  } else if (guest) {
    rows.push({ id: 'auth_signup', title: '✨ Create account', description: 'Wallet & saved history' });
    rows.push({ id: 'auth_login', title: '🔐 Log in', description: 'Existing Mysogi account' });
  } else {
    rows.push({ id: 'auth_guest', title: '👤 Continue as guest', description: 'Pay via Paystack at checkout' });
    rows.push({ id: 'auth_login', title: '🔐 Log in', description: 'Email & password' });
  }

  return rows.slice(0, 10);
}

async function showSuperAppMenu(phone, options = {}) {
  const user = getUser(phone);
  const loggedIn = isAuthenticated(phone);
  const guest = isGuest(phone);
  const name = formatDisplayName(user);
  const balance = loggedIn ? await wallet.getBalance(phone) : 0;

  let header;
  if (loggedIn) {
    header = `*Welcome, ${name}!* 🌍\n💳 Wallet: *${wallet.formatNaira(balance)}*`;
  } else if (guest) {
    header = `*Guest mode* 👤\n_Pay with Paystack when you checkout_`;
  } else {
    header = `*Welcome to Mysogi* 🌍`;
  }

  const safeRows = buildMainMenuRows(loggedIn, guest);

  const menuBody =
    `${header}\n\n` +
    `*Quick order:* MTN 500 airtime for Mama · airtime for 080…, 081…\n\n` +
    `📇 *Save contacts:* \`save contact Mama 08012345678\`\n` +
    `👥 *Bulk airtime:* tap *Bulk airtime* below or list names/numbers\n\n` +
    `Or tap a service below.`;

  try {
    await whatsapp.sendList(phone, menuBody, 'Open menu', [{ title: 'Mysogi services', rows: safeRows }]);
  } catch (err) {
    const logger = require('../core/logger');
    logger.error('sendList failed for main menu', { phone, error: err.message });
    await whatsapp.sendButtons(
      phone,
      `${menuBody}\n\n_Tap a quick option:_`,
      [
        { id: 'menu_airtime', title: 'Airtime' },
        { id: 'menu_data', title: 'Data' },
        { id: 'svc_main_menu', title: 'Refresh menu' },
      ]
    );
  }

  setSession(phone, {
    step: SUPER_MENU_STEP,
    activeService: null,
    data: { authMode: loggedIn ? 'authenticated' : guest ? 'guest' : 'pending', menuPage: 1 },
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
    data: {
      authMode: isAuthenticated(phone) ? 'authenticated' : isGuest(phone) ? 'guest' : 'pending',
      menuPage: 2,
    },
  });
}

function isSuperMenuStep(session) {
  return !session?.activeService && (session?.step === SUPER_MENU_STEP || session?.step === 'idle');
}

module.exports = { showSuperAppMenu, showMoreServicesMenu, isSuperMenuStep, SUPER_MENU_STEP, formatDisplayName };
