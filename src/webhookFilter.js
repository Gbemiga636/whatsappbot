/**
 * Meta sends every WABA message to every subscribed app webhook.
 * Each app MUST only reply when metadata.phone_number_id matches its own number.
 */
function parseWebhookMessage(body) {
  const entry = body?.entry?.[0];
  const value = entry?.changes?.[0]?.value;
  if (!value?.messages?.length) return null;

  return {
    wabaId: entry?.id || '',
    phoneNumberId: value.metadata?.phone_number_id || '',
    displayNumber: value.metadata?.display_phone_number || '',
    messages: value.messages,
    value,
  };
}

function normalizePhoneNumberId(id) {
  const v = String(id || '').trim();
  if (!v) return '';
  if (v.includes('=')) return v.split('=').pop().trim().replace(/\D/g, '');
  return v.replace(/\D/g, '');
}

function shouldHandleWebhook(parsed, configuredPhoneNumberId) {
  if (!parsed) return { handle: false, reason: 'no_messages' };
  const expected = normalizePhoneNumberId(configuredPhoneNumberId);
  if (!expected) {
    return { handle: false, reason: 'missing_phone_number_id_in_env' };
  }
  if (!parsed.phoneNumberId) {
    return { handle: true, reason: 'no_inbound_phone_id' };
  }
  const inbound = normalizePhoneNumberId(parsed.phoneNumberId);
  if (inbound !== expected) {
    return {
      handle: false,
      reason: 'wrong_phone_number_id',
      inbound,
      expected,
      display: parsed.displayNumber,
    };
  }
  return { handle: true, reason: 'match' };
}

module.exports = { parseWebhookMessage, shouldHandleWebhook };
