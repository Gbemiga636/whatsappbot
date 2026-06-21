const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { randomUUID } = require('crypto');
const config = require('./config');

const CREATIVE_ROOT = path.join(__dirname, '..', 'data', 'creatives');

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

function extensionFromMime(mime, filename) {
  if (filename && filename.includes('.')) {
    return path.extname(filename).toLowerCase();
  }
  return MIME_EXT[mime] || '.bin';
}

function parseMediaBlock(message) {
  const type = message.type;
  if (!['image', 'document', 'video', 'audio'].includes(type)) return null;
  const block = message[type];
  if (!block?.id) return null;
  return { type, block };
}

async function downloadWhatsAppMedia(message, phone) {
  const parsed = parseMediaBlock(message);
  if (!parsed) return { ok: false, message: 'Unsupported file type.' };

  const { type, block } = parsed;
  const token = config.whatsapp.token;
  const api = `https://graph.facebook.com/${config.whatsapp.apiVersion}`;

  try {
    const { data: meta } = await axios.get(`${api}/${block.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 25000,
    });

    if (!meta?.url) {
      return { ok: false, message: 'Could not read file from WhatsApp.' };
    }

    const mime = block.mime_type || meta.mime_type || 'application/octet-stream';
    const { data: bin } = await axios.get(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: 25 * 1024 * 1024,
    });

    const ext = extensionFromMime(mime, block.filename);
    const phoneDir = path.join(CREATIVE_ROOT, String(phone).replace(/\D/g, ''));
    fs.mkdirSync(phoneDir, { recursive: true });

    const storedName = `${randomUUID()}${ext}`;
    const absolutePath = path.join(phoneDir, storedName);
    fs.writeFileSync(absolutePath, bin);

    const relativePath = path.join('data', 'creatives', String(phone).replace(/\D/g, ''), storedName);

    return {
      ok: true,
      file: {
        mediaId: block.id,
        type,
        mimeType: mime,
        originalName: block.filename || storedName,
        caption: block.caption || '',
        path: relativePath.replace(/\\/g, '/'),
        sizeBytes: bin.length,
        savedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { ok: false, message: `Download failed: ${msg}` };
  }
}

function formatCreativeLabel(file) {
  const name = file.originalName || file.type;
  const kb = file.sizeBytes ? ` (${Math.round(file.sizeBytes / 1024)} KB)` : '';
  return `${name}${kb}`;
}

module.exports = {
  downloadWhatsAppMedia,
  parseMediaBlock,
  formatCreativeLabel,
};
