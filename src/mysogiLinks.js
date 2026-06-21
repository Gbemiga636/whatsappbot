const config = require('./config');

const BASE = config.mysogi.website.replace(/\/$/, '');

/** Site routes aligned with mysogi.com.ng navigation */
const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgotpassword',
  createCampaign: '/create-campaign',
  campaigns: '/campaigns',
  dashboard: '/dashboard',
  wallet: '/wallet',
  topup: '/wallet/topup',
  terms: '/terms-of-use',
  privacy: '/privacy-policy',
};

function buildUrl(route, phone) {
  const path = ROUTES[route] || route;
  const url = new URL(path, BASE);
  url.searchParams.set('ref', 'whatsapp');
  if (phone) url.searchParams.set('wa', String(phone).replace(/\D/g, ''));
  return url.toString();
}

module.exports = { ROUTES, buildUrl, BASE };
