/**
 * Detect Nigerian mobile network from MSISDN prefix.
 * Note: number portability (MNP) means this can be wrong — always allow override.
 */

const PREFIX_NETWORK = {
  // MTN
  '0702': 'MTN',
  '0703': 'MTN',
  '0704': 'MTN',
  '0706': 'MTN',
  '0803': 'MTN',
  '0806': 'MTN',
  '0810': 'MTN',
  '0813': 'MTN',
  '0814': 'MTN',
  '0816': 'MTN',
  '0903': 'MTN',
  '0906': 'MTN',
  '0913': 'MTN',
  '0916': 'MTN',
  // Glo
  '0705': 'GLO',
  '0805': 'GLO',
  '0807': 'GLO',
  '0811': 'GLO',
  '0815': 'GLO',
  '0905': 'GLO',
  '0915': 'GLO',
  // Airtel
  '0701': 'Airtel',
  '0708': 'Airtel',
  '0802': 'Airtel',
  '0808': 'Airtel',
  '0812': 'Airtel',
  '0901': 'Airtel',
  '0902': 'Airtel',
  '0904': 'Airtel',
  '0907': 'Airtel',
  '0911': 'Airtel',
  '0912': 'Airtel',
  // 9mobile
  '0809': '9mobile',
  '0817': '9mobile',
  '0818': '9mobile',
  '0908': '9mobile',
  '0909': '9mobile',
  '0918': '9mobile',
};

function toLocal11(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length >= 13) return `0${digits.slice(3)}`;
  if (digits.startsWith('0') && digits.length >= 11) return digits.slice(0, 11);
  if (digits.length === 10) return `0${digits}`;
  return digits;
}

function detectNetwork(phone) {
  const local = toLocal11(phone);
  if (!local || local.length < 4) {
    return { ok: false, network: null, prefix: null, phone: local };
  }
  const prefix = local.slice(0, 4);
  const network = PREFIX_NETWORK[prefix] || null;
  return {
    ok: !!network,
    network,
    prefix,
    phone: local,
    note: network
      ? `Detected *${network}* from ${prefix}…`
      : 'Could not detect network from this number',
  };
}

function detectNetworkOrNull(phone) {
  const d = detectNetwork(phone);
  return d.ok ? d.network : null;
}

module.exports = {
  detectNetwork,
  detectNetworkOrNull,
  toLocal11,
  PREFIX_NETWORK,
};
