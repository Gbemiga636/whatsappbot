/**
 * Helpers for VTU catalog display — period buckets & WhatsApp list pagination.
 */

const PAGE_SIZE = 9;

function classifyBundlePeriod(name) {
  const n = String(name || '').toLowerCase();
  if (/\bdaily\b|\b1\s*day\b|1-day|\(1 day\)|per day/.test(n)) return 'daily';
  if (/\bweekly\b|\b7\s*day|\b7-day|\(7 day\)|2-week|14.day|14days/.test(n)) return 'weekly';
  if (/\bmonthly\b|\b30\s*day|\b30-day|\(30 day\)|2-month|3-month|90.day|180.day|yearly|12.month|\bmonth\b/.test(n)) {
    return 'monthly';
  }
  return 'other';
}

function filterBundlesByPeriod(bundles, period) {
  if (!period || period === 'all') return bundles;
  return bundles.filter((b) => classifyBundlePeriod(b.planName) === period);
}

function paginateItems(items, page = 0) {
  const start = page * PAGE_SIZE;
  const slice = items.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < items.length;
  return { items: slice, page, hasMore, total: items.length };
}

function formatBundleTitle(bundle) {
  const name = String(bundle.planName || 'Bundle').slice(0, 18);
  const amt = Number(bundle.amount);
  return amt ? `${name} — ₦${amt.toLocaleString('en-NG')}` : name;
}

function formatAmountTitle(amount) {
  return `₦${Number(amount).toLocaleString('en-NG')}`;
}

module.exports = {
  PAGE_SIZE,
  classifyBundlePeriod,
  filterBundlesByPeriod,
  paginateItems,
  formatBundleTitle,
  formatAmountTitle,
};
