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

function shouldHandleWebhook(parsed, configuredPhoneNumberId) {
  if (!parsed) return { handle: false, reason: 'no_messages' };
  if (!configuredPhoneNumberId) {
    return { handle: false, reason: 'missing_phone_number_id_in_env' };
  }
  if (!parsed.phoneNumberId) {
    return { handle: true, reason: 'no_inbound_phone_id' };
  }
  if (parsed.phoneNumberId !== configuredPhoneNumberId) {
    return {
      handle: false,
      reason: 'wrong_phone_number_id',
      inbound: parsed.phoneNumberId,
      expected: configuredPhoneNumberId,
      display: parsed.displayNumber,
    };
  }
  return { handle: true, reason: 'match' };
}

module.exports = { parseWebhookMessage, shouldHandleWebhook };
