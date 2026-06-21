const config = require('./config');
const { fetchBillboards } = require('./mysogiApi');
const {
  BILLBOARDS: LOCAL_BILLBOARDS,
  BILLBOARD_CAMPAIGN_NOTE,
  BILLBOARD_TYPE_FILTERS,
} = require('./data/billboards');

/**
 * @typedef {Object} Billboard
 * @property {string} id
 * @property {string} name
 * @property {'led'|'static'} type
 * @property {string} location
 * @property {string} area
 * @property {string} size
 * @property {{ daily: number, weekly: number, monthly: number, note?: string }} impressions
 * @property {{ daily: number|null, weekly: number|null, monthly: number|null, currency: string, note?: string }} pricing
 * @property {string[]} [features]
 */

let cachedRemote = null;
let cacheTime = 0;
const CACHE_MS = 5 * 60 * 1000;

function formatNaira(amount) {
  if (amount == null) return '—';
  return `₦${Number(amount).toLocaleString('en-NG')}`;
}

function formatImpressions(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-NG');
}

function normalizeApiItem(item) {
  return {
    id: String(item.id || item._id || item.slug),
    name: item.name || item.title,
    type: (item.type || item.boardType || 'led').toLowerCase().includes('static')
      ? 'static'
      : 'led',
    location: item.location || item.address || '',
    area: item.area || item.city || item.state || '',
    size: item.size || item.dimension || '',
    impressions: {
      daily: item.impressionsDaily ?? item.dailyImpressions ?? item.impressions?.daily,
      weekly: item.impressionsWeekly ?? item.weeklyImpressions ?? item.impressions?.weekly,
      monthly: item.impressionsMonthly ?? item.monthlyImpressions ?? item.impressions?.monthly,
      note: item.impressionsNote || 'Modeled visibility',
    },
    pricing: {
      daily: item.priceDaily ?? item.dailyPrice ?? item.pricing?.daily,
      weekly: item.priceWeekly ?? item.weeklyPrice ?? item.pricing?.weekly,
      monthly: item.priceMonthly ?? item.monthlyPrice ?? item.pricing?.monthly,
      currency: item.currency || 'NGN',
      note: item.pricingNote,
    },
    features: item.features || [],
  };
}

async function fetchRemoteBillboards(userToken) {
  if (!config.mysogi.apiBaseUrl) return null;

  if (cachedRemote && Date.now() - cacheTime < CACHE_MS) {
    return cachedRemote;
  }

  try {
    const list = await fetchBillboards(userToken || undefined);
    if (!list?.length) return null;
    cachedRemote = list.map(normalizeApiItem);
    cacheTime = Date.now();
    return cachedRemote;
  } catch {
    return null;
  }
}

async function getAllBillboards(userToken) {
  const remote = await fetchRemoteBillboards(userToken);
  return remote?.length ? remote : LOCAL_BILLBOARDS;
}

function filterByType(billboards, filterId) {
  if (filterId === 'all') return billboards;
  return billboards.filter((b) => b.type === filterId);
}

function getBillboardById(billboards, id) {
  return billboards.find((b) => b.id === id);
}

function formatBillboardDetail(b) {
  const typeLabel = b.type === 'led' ? 'LED Digital' : 'Static';
  let text =
    `*${b.name}*\n` +
    `Type: ${typeLabel}\n` +
    `📍 Location: ${b.location}\n` +
    `Area: ${b.area}\n` +
    `Size: ${b.size}\n\n` +
    `*Impressions (modeled)*\n` +
    `• Daily: ${formatImpressions(b.impressions.daily)}\n` +
    `• Weekly: ${formatImpressions(b.impressions.weekly)}\n` +
    `• Monthly: ${formatImpressions(b.impressions.monthly)}\n` +
    `_${b.impressions.note || ''}_\n\n` +
    `*Pricing*\n`;

  if (b.type === 'led') {
    text +=
      `• Daily: ${formatNaira(b.pricing.daily)}\n` +
      `• Weekly: ${formatNaira(b.pricing.weekly)}\n` +
      `• Monthly: ${formatNaira(b.pricing.monthly)}\n`;
  } else if (b.pricing.monthly) {
    text += `• Monthly: ${formatNaira(b.pricing.monthly)}\n`;
    if (b.pricing.note) text += `_${b.pricing.note}_\n`;
  } else {
    text += `_Contact Mysogi for static board pricing._\n`;
  }

  if (b.features?.length) {
    text += `\n*Highlights*\n${b.features.map((f) => `• ${f}`).join('\n')}`;
  }

  return text;
}

function formatCatalogMessage(filterId, billboards) {
  const filterLabel =
    BILLBOARD_TYPE_FILTERS.find((f) => f.id === filterId)?.title || 'All';

  if (!billboards.length) {
    return `No *${filterLabel}* billboards found. Try *All* or visit ${config.mysogi.website}/login`;
  }

  let header =
    `*Billboard Campaign — ${filterLabel}*\n\n` +
    `${BILLBOARD_CAMPAIGN_NOTE}\n\n` +
    `*${billboards.length} board(s) available:*\n`;

  const summaries = billboards.map((b, i) => {
    const from =
      b.type === 'led'
        ? `from ${formatNaira(b.pricing.daily)}/day`
        : `from ${formatNaira(b.pricing.monthly)}/mo`;
    return (
      `${i + 1}. *${b.name}* (${b.type.toUpperCase()})\n` +
      `   📍 ${b.location}\n` +
      `   👁 ~${formatImpressions(b.impressions.daily)}/day impressions\n` +
      `   💰 ${from}`
    );
  });

  return header + summaries.join('\n\n');
}

function toListRows(billboards) {
  return billboards.slice(0, 10).map((b) => ({
    id: b.id,
    title: b.name.slice(0, 24),
    description: `${b.type.toUpperCase()} · ${b.area}`.slice(0, 72),
  }));
}

function getDurationOptions(billboard) {
  if (billboard.type === 'static') {
    return [
      { id: 'monthly', title: 'Monthly', description: formatNaira(billboard.pricing.monthly) },
      { id: 'weekly', title: 'Weekly', description: 'If available — confirm' },
    ];
  }
  return [
    {
      id: 'daily',
      title: 'Daily',
      description: formatNaira(billboard.pricing.daily),
    },
    {
      id: 'weekly',
      title: 'Weekly',
      description: formatNaira(billboard.pricing.weekly),
    },
    {
      id: 'monthly',
      title: 'Monthly',
      description: formatNaira(billboard.pricing.monthly),
    },
  ];
}

function resolveDurationPrice(billboard, durationId) {
  const map = {
    daily: billboard.pricing.daily,
    weekly: billboard.pricing.weekly,
    monthly: billboard.pricing.monthly,
  };
  return map[durationId];
}

function resolveDurationImpressions(billboard, durationId) {
  const map = {
    daily: billboard.impressions.daily,
    weekly: billboard.impressions.weekly,
    monthly: billboard.impressions.monthly,
  };
  return map[durationId];
}

module.exports = {
  BILLBOARD_CAMPAIGN_NOTE,
  BILLBOARD_TYPE_FILTERS,
  getAllBillboards,
  filterByType,
  getBillboardById,
  formatBillboardDetail,
  formatCatalogMessage,
  toListRows,
  getDurationOptions,
  resolveDurationPrice,
  resolveDurationImpressions,
  formatNaira,
  formatImpressions,
};
