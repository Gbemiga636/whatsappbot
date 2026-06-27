/**
 * Service registry — all Mysogi super-app modules.
 */

const WalletService = require('../services/wallet');
const BankingService = require('../services/banking');
const AirtimeService = require('../services/airtime');
const BillsService = require('../services/bills');
const FoodService = require('../services/food');
const ShoppingService = require('../services/shopping');
const LoansService = require('../services/loans');
const AdsStudioService = require('../services/adsStudio');
const TravelService = require('../services/travel');
const BusinessService = require('../services/business');
const AiAssistantService = require('../services/aiAssistant');
const HealthcareService = require('../services/healthcare');
const MarketplaceService = require('../services/marketplace');
const EducationService = require('../services/education');
const AgricultureService = require('../services/agriculture');
const JobsService = require('../services/jobs');
const PartnersService = require('../services/partners');

const SERVICES = [
  { id: 'wallet', tier: 'core', live: true },
  { id: 'airtime', tier: 'core', live: true },
  { id: 'bills', tier: 'core', live: true },
  { id: 'partners', tier: 'core', live: true },
  { id: 'ai', tier: 'core', live: true },
  { id: 'ads', tier: 'core', live: true },
  { id: 'food', tier: 'core', live: false },
  { id: 'shopping', tier: 'core', live: false },
  { id: 'banking', tier: 'core', live: false },
  { id: 'loans', tier: 'core', live: false },
  { id: 'travel', tier: 'core', live: false },
  { id: 'business', tier: 'more', live: false },
  { id: 'healthcare', tier: 'more', live: false },
  { id: 'marketplace', tier: 'more', live: false },
  { id: 'education', tier: 'more', live: false },
  { id: 'agriculture', tier: 'more', live: false },
  { id: 'jobs', tier: 'more', live: false },
];

const instances = {
  wallet: new WalletService(),
  banking: new BankingService(),
  airtime: new AirtimeService(),
  bills: new BillsService(),
  food: new FoodService(),
  shopping: new ShoppingService(),
  loans: new LoansService(),
  ads: new AdsStudioService(),
  travel: new TravelService(),
  business: new BusinessService(),
  ai: new AiAssistantService(),
  healthcare: new HealthcareService(),
  marketplace: new MarketplaceService(),
  education: new EducationService(),
  agriculture: new AgricultureService(),
  jobs: new JobsService(),
  partners: new PartnersService(),
};

const SERVICE_ALIASES = {
  svc_wallet: 'wallet',
  svc_banking: 'banking',
  svc_airtime: 'airtime',
  svc_bills: 'bills',
  svc_food: 'food',
  svc_shopping: 'shopping',
  svc_loans: 'loans',
  svc_ads: 'ads',
  svc_travel: 'travel',
  svc_ai: 'ai',
  svc_business: 'business',
  svc_healthcare: 'healthcare',
  svc_marketplace: 'marketplace',
  svc_education: 'education',
  svc_agriculture: 'agriculture',
  svc_jobs: 'jobs',
  svc_partners: 'partners',
};

function getService(id) {
  return instances[id] || null;
}

function resolveServiceId(choice) {
  if (!choice) return null;
  const c = choice.toLowerCase().trim();
  if (SERVICE_ALIASES[c]) return SERVICE_ALIASES[c];
  if (instances[c]) return c;
  if (c === 'svc_more_menu' || c === 'svc_main_menu') return null;
  if (c.startsWith('svc_')) return SERVICE_ALIASES[c] || c.replace('svc_', '');
  if (c.startsWith('partner_')) return 'partners';
  return null;
}

module.exports = { SERVICES, getService, resolveServiceId, instances };
