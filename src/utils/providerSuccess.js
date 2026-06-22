/**
 * Detect provider messages that mean success (incl. ERight async "sent to Webhook").
 */
function isProviderSuccessMessage(message) {
  const t = String(message || '').toLowerCase();
  if (!t) return false;

  if (/\b(invalid|insufficient|denied|rejected|wrong pin)\b/i.test(t)) return false;
  if (/\bfailed\b/i.test(t) && !/processed successfully/i.test(t)) return false;
  if (/\bnot found\b/i.test(t)) return false;
  if (/\berror\b/i.test(t) && !/\bwebhook\b/i.test(t) && !/success/i.test(t)) return false;

  return (
    /processed successfully/i.test(t) ||
    /successfully processed/i.test(t) ||
    /transaction successful/i.test(t) ||
    /order is processed/i.test(t) ||
    /order has been processed/i.test(t) ||
    (/sent to webhook/i.test(t) && /success/i.test(t))
  );
}

function normalizeProviderResult(result) {
  if (!result || result.ok) return result;
  if (isProviderSuccessMessage(result.message)) {
    return {
      ...result,
      ok: true,
      pendingWebhook: /webhook/i.test(String(result.message || '')),
    };
  }
  return result;
}

module.exports = { isProviderSuccessMessage, normalizeProviderResult };
