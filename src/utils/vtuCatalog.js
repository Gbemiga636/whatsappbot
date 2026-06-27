/**
 * Helpers for VTU catalog display — period buckets & WhatsApp list pagination.
 * WhatsApp list row limits: title 24 chars, description 72 chars.
 */

const PAGE_SIZE = 8;
const WA_TITLE_MAX = 24;
const WA_DESC_MAX = 72;

function clipMenuText(text, max) {
  const s = String(text || '').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

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

function formatAmountTitle(amount) {
  return clipMenuText(`₦${Number(amount).toLocaleString('en-NG')}`, WA_TITLE_MAX);
}

/**
 * Catalog row — price in title, full label in description (data, DSTV, GOtv, etc.)
 */
function formatCatalogListRow({ name, planName, amount, network, subtitle }) {
  const label = String(planName || name || 'Plan').trim();
  const amt = Number(amount);
  const price = Number.isFinite(amt) && amt > 0 ? `₦${amt.toLocaleString('en-NG')}` : '';
  const title = price ? clipMenuText(price, WA_TITLE_MAX) : clipMenuText(label, WA_TITLE_MAX);

  let description = label;
  if (subtitle) description = `${label} · ${subtitle}`;
  if (network && price) description = `${label} · ${network}`;

  return {
    title,
    description: clipMenuText(description, WA_DESC_MAX),
    fullLabel: label,
  };
}

/** @deprecated use formatCatalogListRow */
function formatBundleListRow(bundle) {
  return formatCatalogListRow({
    planName: bundle.planName,
    amount: bundle.amount,
    network: bundle.network,
  });
}

/** Provider / bookmaker row — short code or name in title, full name in description */
function formatProviderListRow({ name, code, subtitle }) {
  const full = String(name || '').replace(/\[.*?\]/g, '').trim();
  const codeLabel = String(code || '').trim().toUpperCase();
  const title = clipMenuText(codeLabel || full, WA_TITLE_MAX);
  const description = clipMenuText(
    [full, subtitle].filter(Boolean).join(' · '),
    WA_DESC_MAX
  );
  return { title, description, fullLabel: full };
}

/** Numbered full labels for list body (current page only) */
function formatCatalogPagePreamble(items, { getLabel, getAmount, header } = {}) {
  if (!items?.length) return '';
  const lines = items.map((item, i) => {
    const label = getLabel ? getLabel(item) : item.name || item.planName || 'Plan';
    const amt = getAmount ? getAmount(item) : item.amount;
    const price =
      Number.isFinite(Number(amt)) && Number(amt) > 0
        ? ` — ₦${Number(amt).toLocaleString('en-NG')}`
        : '';
    return `${i + 1}. ${label}${price}`;
  });
  const body = lines.join('\n');
  return header ? `${header}\n\n${body}` : body;
}

function formatBundleTitle(bundle) {
  const name = String(bundle.planName || bundle.name || 'Bundle').trim();
  const amt = Number(bundle.amount);
  return amt ? `${name} — ₦${amt.toLocaleString('en-NG')}` : name;
}

function paginateItems(items, page = 0) {
  const start = page * PAGE_SIZE;
  const slice = items.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < items.length;
  return { items: slice, page, hasMore, total: items.length };
}

module.exports = {
  PAGE_SIZE,
  WA_TITLE_MAX,
  WA_DESC_MAX,
  clipMenuText,
  classifyBundlePeriod,
  filterBundlesByPeriod,
  paginateItems,
  formatBundleTitle,
  formatBundleListRow,
  formatCatalogListRow,
  formatProviderListRow,
  formatCatalogPagePreamble,
  formatAmountTitle,
};
