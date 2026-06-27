/**
 * List all AutoSyncNG products/plans (read-only — no PIN needed)
 * Run: npm run list:autosyncng
 * Filter: npm run list:autosyncng -- --network=MTN --type=data
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const axios = require('axios');

const KEY = process.env.AUTOSYNCNG_API_KEY;
const BASE = (process.env.AUTOSYNCNG_BASE_URL || 'https://autosyncng.com/api/v1').replace(/\/$/, '');

const CATALOGS = [
  { key: 'airtime', path: '/airtime', label: 'Airtime VTU' },
  { key: 'data', path: '/data', label: 'Data Gifting' },
  { key: 'dataSme', path: '/data/sme', label: 'Data SME' },
  { key: 'dataTransfer', path: '/data/transfer', label: 'Data Transfer' },
  { key: 'dataCorporate', path: '/data/corporate', label: 'Data Corporate' },
  { key: 'electricity', path: '/electricity', label: 'Electricity' },
  { key: 'cable', path: '/cable', label: 'Cable TV' },
];

function arg(name) {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

function printCategory(label, category, filters = {}) {
  if (!category?.products?.length) return 0;
  let count = 0;

  console.log(`\n${'='.repeat(60)}\n${label}\n${'='.repeat(60)}`);

  for (const product of category.products) {
    const net = String(product.code || product.name || '').toLowerCase();
    if (filters.network && !net.includes(filters.network)) continue;

    console.log(`\n[${product.name}] product_id=${product.id} code=${product.code}`);

    if (!product.variations?.length) {
      console.log('  Any amount (enter value at purchase time)');
      count += 1;
      continue;
    }

    for (const v of product.variations) {
      if (filters.type === 'data' && filters.q) {
        const hay = `${v.name} ${v.code}`.toLowerCase();
        if (!hay.includes(filters.q)) continue;
      }
      const price = Number(v.amount);
      const amt = price ? `₦${price.toLocaleString('en-NG')}` : 'price TBD';
      console.log(`  • ${v.name}`);
      console.log(`    variation_code: ${v.code} | ${amt}`);
      count += 1;
    }
  }

  return count;
}

async function main() {
  if (!KEY) {
    console.error('Set AUTOSYNCNG_API_KEY in .env');
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${KEY}`, Accept: 'application/json' };
  const network = arg('network')?.toLowerCase();
  const type = arg('type')?.toLowerCase();
  const q = arg('q')?.toLowerCase();

  const me = await axios.get(`${BASE}/me`, { headers, validateStatus: () => true });
  const user = me.data?.data?.user;
  if (me.data?.status === 'ok') {
    console.log(`Account: ${user?.name} | ${user?.email}`);
    console.log(`Wallet: ₦${Number(user?.wallet?.balance ?? user?.wallet_balance ?? 0).toLocaleString('en-NG')}`);
  }

  let total = 0;
  for (const cat of CATALOGS) {
    if (type === 'airtime' && cat.key !== 'airtime') continue;
    if (type === 'data' && !cat.key.startsWith('data')) continue;
    if (type === 'electricity' && cat.key !== 'electricity') continue;
    if (type === 'cable' && cat.key !== 'cable') continue;

    const res = await axios.get(`${BASE}${cat.path}`, { headers, timeout: 30000, validateStatus: () => true });
    if (res.data?.status !== 'ok') {
      console.log(`\n[${cat.label}] unavailable — ${res.data?.message || res.status}`);
      continue;
    }
    total += printCategory(cat.label, res.data.data?.category, { network, type, q });
  }

  console.log(`\nTotal plans listed: ${total}`);
  console.log('\nTip: filter with --network=mtn --type=data --q=1gb');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
