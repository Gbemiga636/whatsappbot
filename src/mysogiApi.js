const axios = require('axios');
const config = require('./config');

function parseBody(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

function apiClient(userToken) {
  const token = userToken || config.mysogi.apiKey;
  if (!token) return null;

  return axios.create({
    baseURL: config.mysogi.apiBaseUrl.replace(/\/$/, ''),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 20000,
    validateStatus: () => true,
  });
}

function isConfigured(userToken) {
  return !!(config.mysogi.apiBaseUrl && (userToken || config.mysogi.apiKey));
}

function unwrap(data) {
  const parsed = parseBody(data);
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.status === 'success') return parsed.data ?? parsed;
  return parsed.data ?? parsed;
}

function extractBalance(data) {
  const d = unwrap(data) || data;
  const raw =
    d?.balance ??
    d?.walletBalance ??
    d?.availableBalance ??
    d?.wallet?.balance ??
    d?.amount ??
    d?.data?.balance;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString('en-NG')}`;
}

function estimateCampaignCost(campaign) {
  if (campaign.estimatedCost != null) return Number(campaign.estimatedCost);
  if (campaign.billboardPrice != null) return Number(campaign.billboardPrice);
  const digits = String(campaign.budget || '').replace(/[^\d.]/g, '');
  const n = parseFloat(digits);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function mapAdType(adType) {
  const map = {
    billboard: 'billboard',
    smart_sms: 'sms',
    display: 'display',
    voice: 'voice',
    influencer: 'influencer',
    mini_website: 'mini_website',
    app_download: 'app_download',
  };
  return map[adType] || adType;
}

function buildCampaignBody(campaign, options = {}) {
  const cost = options.amount ?? estimateCampaignCost(campaign);
  return {
    source: 'whatsapp',
    channel: 'whatsapp',
    type: mapAdType(campaign.adType),
    adType: campaign.adType,
    name: campaign.campaignName,
    amount: cost,
    payFromWallet: options.payFromWallet !== false,
    contact: {
      name: campaign.contactName,
      email: campaign.email,
      phone: campaign.phone,
    },
    billboard: campaign.adType === 'billboard' ? {
      id: campaign.billboardId,
      name: campaign.billboardName,
      duration: campaign.billboardDurationId || campaign.billboardDuration,
      price: campaign.billboardPrice,
    } : undefined,
    creatives: (campaign.creatives || []).map((f) => ({
      name: f.originalName,
      mimeType: f.mimeType,
      path: f.path,
      type: f.type,
    })),
    copy: campaign.adCopy || campaign.message,
    notes: campaign.notes,
    payload: campaign,
  };
}

async function tryRequest(method, paths, token, body) {
  const client = apiClient(token);
  if (!client) return null;

  for (const path of paths) {
    const res = await client.request({ method, url: path, data: body });
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, data: res.data, path };
    }
    if (res.status === 402 || res.status === 400) {
      const msg =
        res.data?.message ||
        res.data?.error?.message ||
        res.data?.errors?.message ||
        'insufficient_balance';
      if (String(msg).toLowerCase().includes('balance') || res.status === 402) {
        return { ok: false, reason: 'insufficient_balance', message: msg, data: res.data };
      }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'auth_required', data: res.data };
    }
  }
  return null;
}

async function getWalletBalance(userToken) {
  const result = await tryRequest(
    'get',
    [
      '/api/wallet/balance',
      '/api/wallet',
      '/api/user/wallet',
      '/api/balance',
      '/api/payments/wallet',
    ],
    userToken
  );

  if (!result?.ok) {
    return { ok: false, reason: result?.reason || 'unavailable' };
  }

  const amount = extractBalance(result.data);
  if (amount == null) {
    return { ok: false, reason: 'parse_error' };
  }

  return { ok: true, amount, formatted: formatNaira(amount) };
}

async function createCampaignOnPlatform(campaign, userToken, options = {}) {
  if (!userToken && !config.mysogi.apiKey) {
    return { synced: false, reason: 'login_required' };
  }

  const body = buildCampaignBody(campaign, {
    amount: options.amount,
    payFromWallet: options.payFromWallet,
  });

  const result = await tryRequest(
    'post',
    [
      '/api/campaigns/create',
      '/api/campaign/create',
      '/api/campaigns',
      '/api/campaign',
      '/campaigns',
    ],
    userToken,
    body
  );

  if (!result) {
    return { synced: false, reason: 'api_unavailable' };
  }

  if (!result.ok) {
    return {
      synced: false,
      reason: result.reason || 'failed',
      message: result.message,
    };
  }

  const payload = unwrap(result.data) || result.data;
  const platformId =
    payload?.id || payload?.campaignId || payload?.campaign?.id || payload?.data?.id;

  return {
    synced: true,
    data: result.data,
    platformId,
    paidFromWallet: body.payFromWallet,
  };
}

async function fetchUserCampaigns(userToken) {
  const client = apiClient(userToken);
  if (!client) return null;

  for (const path of [
    '/api/campaigns',
    '/api/user/campaigns',
    '/api/me/campaigns',
    '/campaigns',
  ]) {
    const res = await client.get(path);
    if (res.status === 200) {
      const parsed = unwrap(res.data) || res.data;
      const list = Array.isArray(parsed)
        ? parsed
        : parsed?.campaigns || parsed?.items || parsed?.data;
      if (Array.isArray(list) && list.length) return list;
    }
  }
  return null;
}

async function fetchBillboards(userToken) {
  const client = apiClient(userToken || config.mysogi.apiKey);
  if (!client) return null;

  for (const path of ['/api/billboards', '/billboards']) {
    const res = await client.get(path);
    if (res.status === 200) {
      const parsed = unwrap(res.data) || res.data;
      const list = Array.isArray(parsed) ? parsed : parsed?.billboards || parsed?.data;
      if (list?.length) return list;
    }
  }
  return null;
}

module.exports = {
  isConfigured,
  formatNaira,
  estimateCampaignCost,
  getWalletBalance,
  createCampaignOnPlatform,
  fetchUserCampaigns,
  fetchBillboards,
};
