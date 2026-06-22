/**
 * Canonical WhatsApp phone normalization (no wallet/userStore deps).
 */
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return digits;
}

function formatPhoneDisplay(phone) {
  const p = normalizePhone(phone);
  return p ? `+${p}` : String(phone || '');
}

module.exports = { normalizePhone, formatPhoneDisplay };
