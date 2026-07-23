/**
 * Super App main menu — Africa's WhatsApp Super App
 * WhatsApp limit: max 10 rows TOTAL per list message.
 */

const whatsapp = require('../whatsapp');
const { getSession, setSession } = require('../sessionStore');
const { getUser, isAuthenticated, isGuest } = require('../userStore');
const { getService } = require('./serviceRegistry');
const wallet = require('../wallet/walletService');
const config = require('../config');
const { pickTip } = require('../tips/advice');

const SUPER_MENU_STEP = 'super_menu';
const BRAND = config.brand?.name || 'Bygate';

const MAIN_VTU_ROWS = [
  { id: 'menu_airtime', title: '💳 Airtime', description: 'Auto-detect network' },
  { id: 'menu_data', title: '📶 Data', description: 'Daily, weekly & monthly bundles' },
  { id: 'menu_bulk', title: '👥 Bulk airtime', description: 'Same airtime for many people' },
  { id: 'menu_contacts', title: '📇 Saved contacts', description: 'save contact Name 080…' },
  { id: 'menu_reminders', title: '🔔 Reminders', description: 'Events & WhatsApp alerts' },
  { id: 'menu_electric', title: '⚡ Electricity', description: 'All discos' },
  { id: 'menu_tv', title: '📺 TV subscription', description: 'DStv, GOtv, StarTimes' },
  { id: 'menu_betting', title: '🎰 Betting', description: 'Fund betting account' },
];

const MORE_SERVICE_IDS = ['partners', 'ads', 'banking', 'shopping', 'travel'];
// Food hidden from main menu for now — re-enable via menu_food when ready

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
    // Priority slots: Paystack top-up + wallet (WhatsApp max 10 rows)
    rows.push({ id: 'menu_wallet_topup', title: '💰 Top up wallet', description: 'Paystack — card, bank, USSD' });
    rows.push({ id: 'svc_wallet', title: '💳 My wallet', description: 'Balance, history & PIN' });
  } else if (guest) {
    rows.push({ id: 'auth_signup', title: '✨ Create account', description: 'Wallet & saved history' });
    rows.push({ id: 'auth_login', title: '🔐 Log in', description: 'Existing Bygate account' });
  } else {
    rows.push({ id: 'auth_guest', title: '👤 Continue as guest', description: 'Pay via Paystack or OPay' });
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
    header = `*Welcome to ${BRAND}, ${name}!* 🌍\n💳 Wallet: *${wallet.formatNaira(balance)}*`;
  } else if (guest) {
    header = `*${BRAND} · Guest mode* 👤\n_Pay with Paystack or OPay at checkout_`;
  } else {
    header = `*Welcome to ${BRAND}* 🌍`;
  }

  const safeRows = buildMainMenuRows(loggedIn, guest);

  const tip = pickTip();
  const menuBody =
    `${header}\n\n` +
    `*Quick order:* 500 airtime for Mama · airtime for 080…\n\n` +
    `📇 *Save contacts:* \`save contact Mama 08012345678\`\n` +
    `🔔 *Reminders:* \`remind me Pay rent on 28/07\`\n` +
    `👥 *Bulk airtime:* tap *Bulk airtime* or list numbers\n` +
    (loggedIn ? `💰 *Top up wallet:* Paystack — card, bank, USSD\n\n` : `\n`) +
    (tip ? `${tip}\n\n` : '') +
    `Or tap a service below.`;

  try {
    await whatsapp.sendList(phone, menuBody, 'Open menu', [{ title: `${BRAND} services`, rows: safeRows }]);
  } catch (err) {
    const logger = require('../core/logger');
    logger.error('sendList failed for main menu', { phone, error: err.message });
    await whatsapp.sendButtons(
      phone,
      `${menuBody}\n\n_Tap a quick option:_`,
      loggedIn
        ? [
            { id: 'menu_airtime', title: 'Airtime' },
            { id: 'menu_wallet_topup', title: 'Top up wallet' },
            { id: 'svc_main_menu', title: 'Refresh menu' },
          ]
        : [
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
      '💡 *Top up your wallet* via Paystack to buy airtime, pay bills & more.',
      [
        { id: 'menu_wallet_topup', title: 'Top up now' },
        { id: 'wallet_topup_other', title: 'For someone else' },
      ]
    );
  }
}

async function showMoreServicesMenu(phone) {
  const rows = [
    ...buildRows(MORE_SERVICE_IDS),
    { id: 'svc_ai', title: '🤖 AI assistant', description: 'Ask anything' },
    { id: 'svc_education', title: '📚 Education', description: 'Coming soon' },
    { id: 'svc_main_menu', title: '⬅️ Back', description: 'Main menu' },
  ].slice(0, 10);

  await whatsapp.sendList(
    phone,
    `*More ${BRAND} services*\n\nPartners, ads, AI & more.`,
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
