/** Mirrors Mysogi.com.ng service offerings */
const AD_TYPES = {
  billboard: {
    id: 'billboard',
    label: 'Billboard Campaign',
    description: 'LED & static — from ₦30k/day',
  },
  smart_sms: {
    id: 'smart_sms',
    label: 'Smart SMS Ads',
    description: 'Target by state, LGA, gender & more',
  },
  display: {
    id: 'display',
    label: 'Visual Display Ads',
    description: 'Programmatic display & awareness',
  },
  voice: {
    id: 'voice',
    label: 'Voice Ads',
    description: 'Pre-recorded voice campaigns',
  },
  influencer: {
    id: 'influencer',
    label: 'Influencer Marketing',
    description: 'Book influencers on-platform',
  },
  mini_website: {
    id: 'mini_website',
    label: 'Mini Website',
    description: 'Free e-commerce site in 5 minutes',
  },
  app_download: {
    id: 'app_download',
    label: 'App Download Campaign',
    description: 'Mobile app install campaigns',
  },
};

const NIGERIAN_STATES = [
  'Lagos', 'Abuja FCT', 'Rivers', 'Oyo', 'Kano', 'Delta', 'Edo', 'Ogun',
  'Kaduna', 'Enugu', 'Anambra', 'Imo', 'Abia', 'Cross River', 'Akwa Ibom',
  'Other / Nationwide',
];

module.exports = {
  AD_TYPES,
  NIGERIAN_STATES,
};
