/**
 * Mysogi billboard catalog — aligned with mysogi.com.ng (Billboard Campaign Ads).
 * LED pricing matches the public site. Impressions are modeled (traffic-based), as on the platform.
 * Set MYSOGI_API_KEY in .env to sync live inventory from api.mysogi.com.ng/billboards.
 */

const BILLBOARD_CAMPAIGN_NOTE =
  'Put your brand on digital billboards in just a few taps starting from *₦30,000/day*. ' +
  'No contracts and no upfront pricing required. Get the best quality for the cheapest price.';

const BILLBOARD_TYPE_FILTERS = [
  { id: 'all', title: 'All', description: 'Every billboard type' },
  { id: 'led', title: 'LED', description: 'Digital LED screens' },
  { id: 'static', title: 'Static', description: 'Traditional static boards' },
];

/** @type {import('../billboardService').Billboard[]} */
const BILLBOARDS = [
  {
    id: 'broad_street_led',
    name: 'Broad Street LED',
    type: 'led',
    location: 'Broad Street, Lagos Island, Lagos',
    area: 'Lagos Island (CBD)',
    size: 'Premium LED digital screen',
    impressions: {
      daily: 95000,
      weekly: 665000,
      monthly: 2850000,
      note: 'Modeled visibility based on CBD traffic volume',
    },
    pricing: {
      daily: 30000,
      weekly: 200000,
      monthly: 750000,
      currency: 'NGN',
    },
    features: ['High CBD foot & vehicle traffic', 'Day & night visibility', 'Multiple creative rotations'],
  },
  {
    id: 'eko_hotel_led',
    name: 'Eko Hotel LED',
    type: 'led',
    location: 'Eko Hotel axis, Victoria Island, Lagos',
    area: 'Victoria Island',
    size: 'Premium LED digital screen',
    impressions: {
      daily: 78000,
      weekly: 546000,
      monthly: 2340000,
      note: 'Modeled visibility — VI hospitality & business corridor',
    },
    pricing: {
      daily: 50000,
      weekly: 300000,
      monthly: 1100000,
      currency: 'NGN',
    },
    features: ['Premium VI audience', 'Event & hotel district exposure', 'LED day/night display'],
  },
  {
    id: 'akin_adesola_led',
    name: 'Akin Adesola LED',
    type: 'led',
    location: 'Akin Adesola Street, Victoria Island, Lagos',
    area: 'Victoria Island',
    size: 'Premium LED digital screen',
    impressions: {
      daily: 72000,
      weekly: 504000,
      monthly: 2160000,
      note: 'Modeled visibility — corporate & retail VI traffic',
    },
    pricing: {
      daily: 50000,
      weekly: 300000,
      monthly: 1100000,
      currency: 'NGN',
    },
    features: ['VI business district', 'Strong drive-by visibility', 'Digital creative flexibility'],
  },
  {
    id: 'adetokumbo_ademola_led',
    name: 'Adetokumbo Ademola LED',
    type: 'led',
    location: 'Adetokunbo Ademola Street, Victoria Island, Lagos',
    area: 'Victoria Island',
    size: 'Premium LED digital screen',
    impressions: {
      daily: 70000,
      weekly: 490000,
      monthly: 2100000,
      note: 'Modeled visibility — VI retail & nightlife corridor',
    },
    pricing: {
      daily: 50000,
      weekly: 300000,
      monthly: 1100000,
      currency: 'NGN',
    },
    features: ['High VI retail traffic', 'Night-time LED impact', 'Rotating ad slots'],
  },
  {
    id: 'lekki_ikate_static',
    name: 'Lekki-Ikate Static',
    type: 'static',
    location: 'Lekki-Ikate Link Road, Lekki, Lagos',
    area: 'Lekki Phase 1',
    size: '20ft × 10ft static face',
    impressions: {
      daily: 45000,
      weekly: 315000,
      monthly: 1350000,
      note: 'Modeled visibility — residential & commercial Lekki flow',
    },
    pricing: {
      daily: null,
      weekly: null,
      monthly: 450000,
      currency: 'NGN',
      note: 'Typical static board rate; confirm on dashboard',
    },
    features: ['Long-term brand presence', 'High local recall', 'Printing & install quoted separately'],
  },
  {
    id: 'third_mainland_static',
    name: 'Third Mainland Static',
    type: 'static',
    location: 'Third Mainland Bridge approach, Lagos',
    area: 'Mainland ↔ Island connector',
    size: '20ft × 10ft static face',
    impressions: {
      daily: 120000,
      weekly: 840000,
      monthly: 3600000,
      note: 'Modeled visibility — major commute corridor',
    },
    pricing: {
      daily: null,
      weekly: null,
      monthly: 550000,
      currency: 'NGN',
      note: 'Typical static board rate; confirm on dashboard',
    },
    features: ['Mass commute exposure', 'Island–Mainland traffic', 'Premium highway visibility'],
  },
  {
    id: 'ikeja_gra_static',
    name: 'Ikeja GRA Static',
    type: 'static',
    location: 'Ikeja GRA, Lagos Mainland',
    area: 'Ikeja',
    size: '20ft × 10ft static face',
    impressions: {
      daily: 38000,
      weekly: 266000,
      monthly: 1140000,
      note: 'Modeled visibility — business & residential Ikeja',
    },
    pricing: {
      daily: null,
      weekly: null,
      monthly: 380000,
      currency: 'NGN',
      note: 'Typical static board rate; confirm on dashboard',
    },
    features: ['Mainland business audience', 'GRA premium placement', 'Static long-run campaigns'],
  },
  {
    id: 'abuja_cbd_static',
    name: 'Abuja CBD Static',
    type: 'static',
    location: 'Central Business District, Abuja FCT',
    area: 'Abuja CBD',
    size: '20ft × 10ft static face',
    impressions: {
      daily: 52000,
      weekly: 364000,
      monthly: 1560000,
      note: 'Modeled visibility — FCT government & corporate zone',
    },
    pricing: {
      daily: null,
      weekly: null,
      monthly: 420000,
      currency: 'NGN',
      note: 'Typical static board rate; confirm on dashboard',
    },
    features: ['Federal capital exposure', 'Government & corporate traffic', 'Nationwide brand lift'],
  },
];

module.exports = {
  BILLBOARD_CAMPAIGN_NOTE,
  BILLBOARD_TYPE_FILTERS,
  BILLBOARDS,
};
