const whatsapp = require('../whatsapp');
const {
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
} = require('../billboardService');

async function reply(to, text) {
  await whatsapp.sendText(to, text);
}

async function showBillboardTypeFilter(to, data) {
  await reply(
    to,
    `*Billboard Campaign Ads*\n\n${BILLBOARD_CAMPAIGN_NOTE}\n\n` +
      `Choose billboard type to browse inventory:`
  );

  await whatsapp.sendButtons(to, 'Filter by type:', [
    { id: 'bb_all', title: 'All' },
    { id: 'bb_led', title: 'LED' },
    { id: 'bb_static', title: 'Static' },
  ]);
}

async function showBillboardCatalogAndPicker(to, data, filterId) {
  const all = await getAllBillboards();
  const filtered = filterByType(all, filterId);
  data.billboardFilter = filterId;
  data.billboardCatalog = filtered.map((b) => b.id);

  const catalogText = formatCatalogMessage(filterId, filtered);
  if (catalogText.length > 4000) {
    const mid = Math.floor(catalogText.length / 2);
    await reply(to, catalogText.slice(0, mid));
    await reply(to, catalogText.slice(mid));
  } else {
    await reply(to, catalogText);
  }

  if (!filtered.length) {
    await reply(to, 'Type *menu* to go back or try another filter.');
    return { step: 'billboard_type_filter', data };
  }

  const rows = toListRows(filtered);
  await whatsapp.sendList(
    to,
    'Select a billboard to continue. Full specs were listed above.',
    'Select billboard',
    [{ title: 'Available boards', rows }]
  );

  return { step: 'billboard_select', data };
}

async function showBillboardDetailAndDuration(to, data, billboardId) {
  const all = await getAllBillboards();
  const board = getBillboardById(all, billboardId);

  if (!board) {
    await reply(to, 'Billboard not found. Please pick from the list.');
    return showBillboardCatalogAndPicker(to, data, data.billboardFilter || 'all');
  }

  data.billboardId = board.id;
  data.billboardName = board.name;
  data.billboardType = board.type;
  data.billboardLocation = board.location;
  data.billboardArea = board.area;
  data.billboardSize = board.size;
  data.billboardImpressions = board.impressions;

  await reply(to, formatBillboardDetail(board));

  const durations = getDurationOptions(board);
  await whatsapp.sendList(
    to,
    `Select campaign duration for *${board.name}*:`,
    'Pick duration',
    [{ title: 'Duration & pricing', rows: durations }]
  );

  return { step: 'billboard_duration', data };
}

function applyDurationSelection(data, board, durationId) {
  const labels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
  data.billboardDuration = labels[durationId] || durationId;
  data.billboardDurationId = durationId;
  data.billboardPrice = resolveDurationPrice(board, durationId);
  data.billboardImpressionsSelected = resolveDurationImpressions(board, durationId);
  data.budget =
    data.billboardPrice != null
      ? `₦${Number(data.billboardPrice).toLocaleString('en-NG')} (${data.billboardDuration})`
      : 'To be confirmed with Mysogi';
}

function formatBillboardSummaryForConfirm(data) {
  return (
    `Billboard: ${data.billboardName}\n` +
    `Board type: ${(data.billboardType || '').toUpperCase()}\n` +
    `Location: ${data.billboardLocation}\n` +
    `Area: ${data.billboardArea}\n` +
    `Size: ${data.billboardSize}\n` +
    `Duration: ${data.billboardDuration}\n` +
    `Est. impressions: ~${Number(data.billboardImpressionsSelected || 0).toLocaleString('en-NG')}\n` +
    `Price: ${data.budget}\n`
  );
}

module.exports = {
  BILLBOARD_TYPE_FILTERS,
  showBillboardTypeFilter,
  showBillboardCatalogAndPicker,
  showBillboardDetailAndDuration,
  applyDurationSelection,
  formatBillboardSummaryForConfirm,
  getBillboardById,
  getAllBillboards,
};
