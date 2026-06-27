/**
 * Message context passed through the super-app pipeline.
 */

function parseIncoming(message) {
  const isMedia = ['image', 'document', 'video', 'audio', 'sticker'].includes(message.type);
  const location =
    message.type === 'location' && message.location
      ? {
          lat: Number(message.location.latitude),
          lng: Number(message.location.longitude),
          name: (message.location.name || '').trim(),
          address: (message.location.address || '').trim(),
        }
      : null;

  return {
    text: (message.text?.body || message.button?.text || '').trim(),
    buttonId: message.interactive?.button_reply?.id || '',
    listId: message.interactive?.list_reply?.id || '',
    flowResponse: message.interactive?.nfm_reply || null,
    media: isMedia ? message : null,
    location,
    messageId: message.id || '',
    timestamp: message.timestamp || '',
    messageType: message.type || 'text',
  };
}

function createContext(from, message, session, user) {
  const incoming = parseIncoming(message);
  return {
    phone: from,
    incoming,
    session: session || { step: 'idle', data: {}, activeService: null },
    user: user || null,
    get text() {
      return incoming.text;
    },
    get choice() {
      return incoming.buttonId || incoming.listId || incoming.text;
    },
    get location() {
      return incoming.location || null;
    },
    get step() {
      return this.session.step;
    },
    get data() {
      return this.session.data || {};
    },
    get activeService() {
      return this.session.activeService;
    },
  };
}

module.exports = { parseIncoming, createContext };
