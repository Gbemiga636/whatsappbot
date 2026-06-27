/**
 * Chowdeck API — vendors, menus, relay delivery.
 * Docs: https://chowdeck-api.readme.io/
 * Prices are in kobo (÷100 for Naira).
 */

const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../core/logger');

const BASE_URL = (config.delivery?.chowdeck?.baseUrl || 'https://api.chowdeck.com').replace(/\/$/, '');

function isConfigured() {
  return Boolean(config.delivery?.chowdeck?.apiKey);
}

function getHeaders() {
  const key = config.delivery?.chowdeck?.apiKey;
  if (!key) {
    const err = new Error('Chowdeck API key not configured. Set CHOWDECK_API_KEY in .env');
    err.code = 'CHOWDECK_NOT_CONFIGURED';
    throw err;
  }
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function koboToNaira(kobo) {
  return Number(kobo || 0) / 100;
}

function formatNaira(kobo) {
  const n = koboToNaira(kobo);
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function nairaToKobo(naira) {
  return Math.round(Number(naira) * 100);
}

function parseCoordinate(vendor) {
  const c = vendor?.coordinate;
  if (!c) return null;
  const lat = Number(c.y ?? c.latitude);
  const lng = Number(c.x ?? c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (!Number.isFinite(km) || km >= 9999) return '';
  if (km < 1) return `${Math.round(km * 1000)}m away`;
  return `${km.toFixed(1)}km away`;
}

async function apiRequest(method, path, body) {
  try {
    const res = await axios({
      method,
      url: `${BASE_URL}${path}`,
      headers: getHeaders(),
      data: body,
      timeout: 28000,
    });
    return res.data;
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    logger.error('Chowdeck API error', { path, status: err.response?.status, message: msg });
    return { status: 'failed', message: msg, _httpStatus: err.response?.status };
  }
}

async function listVendors() {
  const data = await apiRequest('get', '/merchant/');
  if (data?.status === 'failed') {
    return { ok: false, message: data.message, vendors: [] };
  }
  const vendors = (Array.isArray(data?.data) ? data.data : []).filter((v) => v.reference);
  return { ok: true, vendors };
}

function enrichVendors(vendors, userLocation) {
  const { lat, lng } = userLocation || {};
  const hasUser = Number.isFinite(lat) && Number.isFinite(lng);

  return vendors
    .map((v) => {
      const coord = parseCoordinate(v);
      const distanceKm =
        hasUser && coord ? haversineKm(lat, lng, coord.lat, coord.lng) : null;
      return {
        ...v,
        coord,
        distanceKm,
        distanceLabel: formatDistance(distanceKm),
        minOrderNaira: koboToNaira(v.minimum_order_amount),
      };
    })
    .sort((a, b) => {
      const openA = Number(a.is_open) === 1 ? 1 : 0;
      const openB = Number(b.is_open) === 1 ? 1 : 0;
      if (openB !== openA) return openB - openA;
      return (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999);
    });
}

async function listMenuCategories(merchantReference) {
  const ref = encodeURIComponent(merchantReference);
  const data = await apiRequest('get', `/merchant/${ref}/menucategory`);
  if (data?.status === 'failed') {
    return { ok: false, message: data.message, categories: [] };
  }
  const categories = (Array.isArray(data?.data) ? data.data : []).filter(
    (c) => c.is_published !== false
  );
  return { ok: true, categories };
}

async function listMenuItems(merchantReference) {
  const ref = encodeURIComponent(merchantReference);
  const data = await apiRequest('get', `/merchant/${ref}/menu`);
  if (data?.status === 'failed') {
    return { ok: false, message: data.message, items: [] };
  }
  const items = (Array.isArray(data?.data) ? data.data : []).filter(
    (i) => i.in_stock !== false && i.is_published !== false && i.is_active !== false
  );
  return { ok: true, items };
}

function itemsForCategory(items, category) {
  if (!category) return items;
  const catId = category.id;
  const catName = String(category.name || '').toLowerCase();
  return items.filter((item) => {
    if (item.category?.id && catId) return item.category.id === catId;
    const tags = (item.tags || []).map((t) => String(t.name || '').toLowerCase());
    return tags.includes(catName) || String(item.category?.name || '').toLowerCase() === catName;
  });
}

async function getDeliveryFee({ source, destination, orderAmountKobo = 0 }) {
  const body = {
    source_address: {
      latitude: source.lat,
      longitude: source.lng,
    },
    destination_address: {
      latitude: destination.lat,
      longitude: destination.lng,
    },
    source_address_string: source.address || 'Pickup',
    destination_address_string: destination.address || 'Delivery',
    estimated_order_amount: Math.max(0, Math.round(orderAmountKobo)),
  };

  const data = await apiRequest('post', '/relay/delivery/fee', body);
  if (data?.status !== 'success' || !data?.data) {
    return { ok: false, message: data?.message || 'Could not calculate delivery fee' };
  }
  return {
    ok: true,
    feeId: data.data.id,
    deliveryKobo: data.data.delivery_amount || data.data.total_amount || 0,
    totalKobo: data.data.total_amount || 0,
    raw: data.data,
  };
}

async function createRelayDelivery({ feeId, source, destination, customer, orderReference, notes }) {
  const body = {
    fee_id: feeId,
    source_address: {
      latitude: source.lat,
      longitude: source.lng,
    },
    destination_address: {
      latitude: destination.lat,
      longitude: destination.lng,
    },
    source_address_string: source.address || '',
    destination_address_string: destination.address || '',
    customer_name: customer.name || 'Mysogi Customer',
    customer_phone: customer.phone,
    customer_email: customer.email || undefined,
    reference: orderReference || `mysogi_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    note: notes || 'Order via Mysogi WhatsApp',
  };

  const data = await apiRequest('post', '/relay/delivery', body);
  if (data?.status !== 'success') {
    return { ok: false, message: data?.message || 'Delivery could not be created' };
  }
  return { ok: true, delivery: data.data, reference: data.data?.reference || body.reference };
}

function buildOrderReference() {
  return `mysogi_food_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

module.exports = {
  isConfigured,
  koboToNaira,
  nairaToKobo,
  formatNaira,
  parseCoordinate,
  haversineKm,
  listVendors,
  enrichVendors,
  listMenuCategories,
  listMenuItems,
  itemsForCategory,
  getDeliveryFee,
  createRelayDelivery,
  buildOrderReference,
};
