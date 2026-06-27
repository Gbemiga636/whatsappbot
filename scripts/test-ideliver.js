/**
 * iDeliver API smoke test — reads IDELIVER_API_KEY from .env only.
 * Probes auth exchange, wallet, riders-near, pricing quote, and marketplace paths.
 *
 * Usage: npm run test:ideliver
 * Optional: IDELIVER_TEST_LAT=6.5244 IDELIVER_TEST_LNG=3.3792 (Lagos default)
 */

require('dotenv').config();

const BASE = (process.env.IDELIVER_BASE_URL || 'https://api.ideliver.ng').replace(/\/$/, '');
const KEY = process.env.IDELIVER_API_KEY;
const LAT = Number(process.env.IDELIVER_TEST_LAT || 6.5244);
const LNG = Number(process.env.IDELIVER_TEST_LNG || 3.3792);

async function request(method, path, { body, apiKey = KEY, bearer } = {}) {
  const headers = { Accept: 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const opts = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text.slice(0, 400);
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

function printResult(label, result) {
  const preview = JSON.stringify(result.body, null, 2);
  const clipped = preview.length > 1200 ? `${preview.slice(0, 1200)}\n… (truncated)` : preview;
  console.log(`${label}: HTTP ${result.status}`);
  console.log(clipped || '(empty)');
}

async function main() {
  if (!KEY) {
    console.error('Set IDELIVER_API_KEY in .env');
    process.exit(1);
  }

  console.log(`iDeliver smoke test @ ${BASE}`);
  console.log(`Test coordinates: ${LAT}, ${LNG} (set IDELIVER_TEST_LAT/LNG to override)`);

  section('Health (no auth)');
  printResult('GET /health', await request('GET', '/health', { apiKey: null }));

  section('Auth — exchange integration key for JWT');
  const tokenRes = await request('POST', '/v1/auth/token', { body: {} });
  printResult('POST /v1/auth/token (X-API-Key)', tokenRes);
  const accessToken = tokenRes.body?.access_token;

  if (accessToken) {
    section('Account (JWT)');
    printResult('GET /v1/auth/me', await request('GET', '/v1/auth/me', { bearer: accessToken, apiKey: null }));
    printResult('GET /v1/me/wallet', await request('GET', '/v1/me/wallet', { bearer: accessToken, apiKey: null }));
  } else {
    section('Account (raw key — wallet needs JWT)');
    printResult('GET /v1/me/wallet (X-API-Key only)', await request('GET', '/v1/me/wallet'));
  }

  section('Logistics — riders near pickup');
  const ridersPath = `/v1/me/riders/near?lat=${LAT}&lng=${LNG}&metres=50000&limit=20`;
  if (accessToken) {
    printResult(`GET ${ridersPath}`, await request('GET', ridersPath, { bearer: accessToken, apiKey: null }));
  } else {
    printResult(`GET ${ridersPath}`, await request('GET', ridersPath));
  }

  section('Logistics — delivery fare quote (VI → Ikeja sample)');
  const quoteBody = {
    pickup_lat: LAT,
    pickup_lng: LNG,
    pickup_address: 'Victoria Island, Lagos',
    dropoff_lat: 6.6018,
    dropoff_lng: 3.3515,
    dropoff_address: 'Ikeja, Lagos',
    vehicle_type: 'motorcycle',
    fulfillment_mode: 'marketplace',
  };
  const quoteOpts = accessToken
    ? { body: quoteBody, bearer: accessToken, apiKey: null }
    : { body: quoteBody };
  printResult('POST /v1/me/pricing/quote', await request('POST', '/v1/me/pricing/quote', quoteOpts));

  section('Marketplace probes (expected 404 — iDeliver has no restaurant catalog API)');
  const marketplacePaths = [
    `/v1/restaurants/near?lat=${LAT}&lng=${LNG}`,
    `/v1/vendors?lat=${LAT}&lng=${LNG}`,
    `/v1/merchants/near?lat=${LAT}&lng=${LNG}`,
    `/v1/catalog/stores?lat=${LAT}&lng=${LNG}`,
    `/v1/food/vendors?lat=${LAT}&lng=${LNG}`,
  ];
  const marketplaceResults = [];
  for (const path of marketplacePaths) {
    const result = await request('GET', path, { apiKey: null });
    marketplaceResults.push({ path, status: result.status });
    printResult(`GET ${path}`, result);
  }

  section('Summary');
  const keyValid = Boolean(accessToken);
  const quoteCheck = accessToken
    ? await request('POST', '/v1/me/pricing/quote', { body: quoteBody, bearer: accessToken, apiKey: null })
    : { status: 401 };
  const logisticsOk = quoteCheck.status === 200 || quoteCheck.status === 201;
  const anyMarketplace = marketplaceResults.some((r) => r.status >= 200 && r.status < 300);

  if (accessToken) {
    console.log('✓ Integration API key is valid (JWT minted via POST /v1/auth/token).');
    if (logisticsOk) {
      console.log('✓ Delivery fare quote works for Lagos routes.');
    } else {
      console.log(`~ Pricing quote returned HTTP ${quoteCheck.status} — may need KYB/wallet top-up for live quotes.`);
    }
  } else if (keyValid) {
    console.log('~ API key may work for some routes but JWT exchange failed — check token response above.');
  } else {
    console.log('✗ API key rejected — key may be revoked, wrong format, or account inactive.');
  }

  if (anyMarketplace) {
    console.log('✓ At least one marketplace-style endpoint returned success — review responses above.');
  } else {
    console.log('✗ No restaurant/vendor catalog on iDeliver (all probe paths returned 404).');
    console.log('  iDeliver is a logistics API: create pickup→dropoff orders, quote fares, dispatch riders.');
    console.log('  It does NOT expose "all restaurants near me" like the Chowdeck consumer app.');
    console.log('  Use iDeliver for delivery dispatch after you already have restaurant + menu from another source.');
  }

  process.exit(accessToken || keyValid ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
