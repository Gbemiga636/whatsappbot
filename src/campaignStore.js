const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const CAMPAIGNS_FILE = path.join(__dirname, '..', 'data', 'campaigns.json');

function ensureFile() {
  const dir = path.dirname(CAMPAIGNS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CAMPAIGNS_FILE)) {
    fs.writeFileSync(CAMPAIGNS_FILE, '[]');
  }
}

function loadCampaigns() {
  ensureFile();
  return JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf8'));
}

function saveCampaigns(campaigns) {
  ensureFile();
  fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));
}

function saveCampaign(payload) {
  const campaigns = loadCampaigns();
  const record = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'created',
    source: 'whatsapp',
    ...payload,
  };
  campaigns.push(record);
  saveCampaigns(campaigns);
  return record;
}

function getCampaignsByPhone(phone) {
  const normalized = String(phone).replace(/\D/g, '');
  return loadCampaigns().filter((c) => String(c.phone).replace(/\D/g, '') === normalized);
}

function updateCampaign(id, patch) {
  const campaigns = loadCampaigns();
  const idx = campaigns.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  campaigns[idx] = { ...campaigns[idx], ...patch, updatedAt: new Date().toISOString() };
  saveCampaigns(campaigns);
  return campaigns[idx];
}

function formatCampaignForUser(c) {
  const ref = c.id.slice(0, 8).toUpperCase();
  const status = c.platformId ? 'live on Bygate' : c.status || 'created';
  const lines = [
    `*${c.campaignName || 'Campaign'}*`,
    `Ref: ${ref} · ${status}`,
    `Type: ${c.adType}`,
  ];
  if (c.platformId) lines.push(`Dashboard ID: ${c.platformId}`);
  if (c.adType === 'billboard' && c.billboardName) {
    lines.push(`Billboard: ${c.billboardName} (${c.billboardDuration || '—'})`);
  }
  if (c.creatives?.length) {
    lines.push(`Creative: ${c.creatives.length} file(s)`);
  }
  if (c.budget) lines.push(`Budget: ${c.budget}`);
  if (c.createdAt) {
    lines.push(`Created: ${new Date(c.createdAt).toLocaleDateString('en-NG')}`);
  }
  return lines.join('\n');
}

function formatCampaignSummary(c) {
  const lines = [
    `*New Bygate campaign* (#${c.id.slice(0, 8)})`,
    `Type: ${c.adType}`,
    `Name: ${c.campaignName || '—'}`,
    `Contact: ${c.contactName || '—'} | ${c.email || '—'}`,
    `Phone: ${c.phone}`,
  ];

  if (c.adType === 'billboard') {
    lines.push(
      `Billboard: ${c.billboardName || c.billboardLocation} (${c.billboardType || '—'})`
    );
    lines.push(`Location: ${c.billboardLocation} | Duration: ${c.billboardDuration}`);
    if (c.billboardImpressionsSelected) {
      lines.push(`Impressions: ~${c.billboardImpressionsSelected}`);
    }
  }
  if (c.adType === 'smart_sms') {
    lines.push(`SMS target: ${c.smsState || '—'}, ${c.smsGender || 'any'}`);
  }
  if (c.budget) lines.push(`Budget: ${c.budget}`);
  if (c.creatives?.length) {
    c.creatives.forEach((f) => lines.push(`File: ${f.originalName || f.type}`));
  }
  if (c.message || c.adCopy) lines.push(`Copy: ${(c.message || c.adCopy || '').slice(0, 120)}`);
  if (c.notes) lines.push(`Notes: ${c.notes.slice(0, 200)}`);

  lines.push(`Dashboard: ${c.dashboardUrl || 'https://mysogi.com.ng'}`);
  return lines.join('\n');
}

module.exports = {
  saveCampaign,
  updateCampaign,
  getCampaignsByPhone,
  formatCampaignSummary,
  formatCampaignForUser,
};
