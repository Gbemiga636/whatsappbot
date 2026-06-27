/**
 * Helpers for VTU catalog display — period buckets & WhatsApp list pagination.
 */

const PAGE_SIZE = 8;

function classifyBundlePeriod(name) {
  const n = String(name || '').toLowerCase();
  if (/\bdaily\b|\b1\s*day\b|1-day|\(1 day\)|per day|\b2-?day\b|\b3-?day\b|\bawoof\b/i.test(n)) return 'daily';
  if (/\bweekly\b|\b7\s*day|\b7-?day|\(7 day\)|7days|\bawoof\b.*7/.test(n)) return 'weekly';
  if (
    /\bmonthly\b|\b30\s*day|\b30-?day|\(30 day\)|14\s*day|14-?day|14days|\b2-month|\b3-month|90.day|180.day|yearly|12.month|\bmonth\b|\b60\s*day|\b90\s*day/
      .test(n)
  ) {
    return 'monthly';
  }
  return 'other';
}

function filterBundlesByPeriod(bundles, period) {
  if (!period || period === 'all') return bundles;
  return bundles.filter((b) => classifyBundlePeriod(b.planName) === period);
}

/** WhatsApp list: title ≤24 chars, description ≤72 chars */
function formatBundleListRow(bundle) {
  const name = String(bundle.planName || 'Data bundle').trim();
  const amt = Number(bundle.amount);
  const price = amt ? `₦${amt.toLocaleString('en-NG')}` : '';
  const title = price ? `${price}` : name.slice(0, 24);
  const description = price ? `${name} · ${bundle.network || ''}`.trim().slice(0, 72) : name.slice(0, 72);
  return { title: title.slice(0, 24), description };
}

function formatBundleTitle(bundle) {
  const name = String(bundle.planName || 'Bundle').trim();
  const amt = Number(bundle.amount);
  return amt ? `${name} — ₦${amt.toLocaleString('en-NG')}` : name;
}

function paginateItems(items, page = 0) {
  const start = page * PAGE_SIZE;
  const slice = items.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < items.length;
  return { items: slice, page, hasMore, total: items.length };
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
  formatBundleListRow,
  formatAmountTitle,
};
