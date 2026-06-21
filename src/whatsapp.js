const axios = require('axios');
const config = require('./config');

function apiUrl(path) {
  const { apiVersion, phoneNumberId } = config.whatsapp;
  return `https://graph.facebook.com/${apiVersion}/${phoneNumberId}${path}`;
}

async function sendRequest(body, attempt = 1) {
  const { token } = config.whatsapp;
  if (!token || !config.whatsapp.phoneNumberId) {
    throw new Error('WhatsApp credentials missing. Check .env file.');
  }

  try {
    const { data } = await axios.post(apiUrl('/messages'), body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 25000,
    });
    return data;
  } catch (err) {
    const code = err.code || '';
    const retryable = ['ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'ENOTFOUND'].includes(code);
    if (retryable && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return sendRequest(body, attempt + 1);
    }
    if (retryable) {
      err.isNetworkError = true;
      err.userHint =
        'Cannot reach Meta (graph.facebook.com). Try mobile hotspot, VPN, or change DNS to 8.8.8.8 — some networks block Facebook.';
    }
    throw err;
  }
}

async function sendText(to, text) {
  return sendRequest({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: true, body: text },
  });
}

async function sendButtons(to, bodyText, buttons) {
  const interactiveButtons = buttons.slice(0, 3).map((b, i) => ({
    type: 'reply',
    reply: { id: b.id || `btn_${i}`, title: b.title.slice(0, 20) },
  }));

  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText.slice(0, 1024) },
      action: { buttons: interactiveButtons },
    },
  });
}

/** Opens Mysogi login/signup in the phone browser */
async function sendCtaUrl(to, bodyText, displayText, url) {
  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: displayText.slice(0, 20),
          url: url.slice(0, 2000),
        },
      },
    },
  });
}

async function sendFlow(to, { flowId, flowToken, cta, header, body, screen, footer }) {
  return sendRequest({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: header ? { type: 'text', text: header.slice(0, 60) } : undefined,
      body: { text: (body || 'Complete the secure form.').slice(0, 1024) },
      footer: footer ? { text: footer.slice(0, 60) } : { text: 'Mysogi' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: flowToken,
          flow_id: flowId,
          flow_cta: (cta || 'Continue').slice(0, 20),
          flow_action: 'navigate',
          flow_action_payload: {
            screen: screen || 'LOGIN',
          },
        },
      },
    },
  });
}

async function sendList(to, bodyText, buttonLabel, sections) {
  return sendRequest({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText.slice(0, 1024) },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: sections.map((section) => ({
          title: section.title?.slice(0, 24) || 'Options',
          rows: section.rows.map((row) => ({
            id: row.id,
            title: row.title.slice(0, 24),
            description: (row.description || '').slice(0, 72),
          })),
        })),
      },
    },
  });
}

async function markAsRead(messageId) {
  const { token } = config.whatsapp;
  if (!token || !messageId) return;

  try {
    await axios.post(
      apiUrl('/messages'),
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch {
    // non-critical
  }
}

module.exports = {
  sendText,
  sendButtons,
  sendList,
  sendCtaUrl,
  sendFlow,
  markAsRead,
};
