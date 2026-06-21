const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const config = require('./config');

const STORE = path.join(__dirname, '..', 'data', 'whatsapp-flows.json');

function loadStored() {
  try {
    if (fs.existsSync(STORE)) {
      return JSON.parse(fs.readFileSync(STORE, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return {};
}

function saveStored(data) {
  const dir = path.dirname(STORE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2));
}

function getFlowIds() {
  const stored = loadStored();
  return {
    login: config.whatsapp.flowLoginId || stored.loginFlowId || '',
    signup: config.whatsapp.flowSignupId || stored.signupFlowId || '',
    pinSet: config.whatsapp.flowPinSetId || stored.pinSetFlowId || '',
    pinVerify: config.whatsapp.flowPinVerifyId || stored.pinVerifyFlowId || '',
    pin: config.whatsapp.flowPinVerifyId || stored.pinVerifyFlowId || stored.pinFlowId || '',
  };
}

function isReady() {
  const { login, signup } = getFlowIds();
  return !!(login && signup);
}

function graphError(err) {
  const e = err.response?.data?.error;
  if (!e) return err.message;
  const parts = [e.message];
  if (e.error_user_msg) parts.push(e.error_user_msg);
  return parts.join(' — ');
}

async function getFlowHealth(flowId) {
  const api = `https://graph.facebook.com/${config.whatsapp.apiVersion}`;
  const { data } = await axios.get(`${api}/${flowId}`, {
    headers: { Authorization: `Bearer ${config.whatsapp.token}` },
    params: { fields: 'id,status,validation_errors,health_status' },
  });
  return data;
}

async function listFlows() {
  const wabaId = config.whatsapp.businessAccountId;
  const api = `https://graph.facebook.com/${config.whatsapp.apiVersion}`;
  const { data } = await axios.get(`${api}/${wabaId}/flows`, {
    headers: { Authorization: `Bearer ${config.whatsapp.token}` },
    params: { fields: 'id,name,status' },
  });
  return data.data || [];
}

async function findOrCreateFlow(name) {
  const existing = (await listFlows()).find((f) => f.name === name);
  if (existing) return existing.id;

  const wabaId = config.whatsapp.businessAccountId;
  const api = `https://graph.facebook.com/${config.whatsapp.apiVersion}`;
  const createRes = await axios.post(
    `${api}/${wabaId}/flows`,
    { name, categories: ['OTHER'] },
    { headers: { Authorization: `Bearer ${config.whatsapp.token}` } }
  );
  return createRes.data.id;
}

async function uploadFlowAsset(flowId, flowJsonPath) {
  const api = `https://graph.facebook.com/${config.whatsapp.apiVersion}`;
  const form = new FormData();
  form.append('name', 'flow.json');
  form.append('asset_type', 'FLOW_JSON');
  form.append('file', fs.createReadStream(flowJsonPath), {
    filename: 'flow.json',
    contentType: 'application/json',
  });

  const { data } = await axios.post(`${api}/${flowId}/assets`, form, {
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      ...form.getHeaders(),
    },
  });

  if (data.validation_errors?.length) {
    const details = data.validation_errors.map((v) => v.message || JSON.stringify(v)).join('; ');
    throw new Error(`Flow JSON validation failed: ${details}`);
  }
}

async function uploadFlow(name, flowJsonPath) {
  const wabaId = config.whatsapp.businessAccountId;
  const token = config.whatsapp.token;
  if (!wabaId || !token) {
    throw new Error('WHATSAPP_BUSINESS_ACCOUNT_ID and WHATSAPP_ACCESS_TOKEN required');
  }

  const api = `https://graph.facebook.com/${config.whatsapp.apiVersion}`;
  const flowId = await findOrCreateFlow(name);
  await uploadFlowAsset(flowId, flowJsonPath);

  let status = 'DRAFT';
  let publishError = '';

  try {
    await axios.post(`${api}/${flowId}/publish`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    status = 'PUBLISHED';
  } catch (err) {
    publishError = graphError(err);
  }

  let health;
  try {
    health = await getFlowHealth(flowId);
    status = health.status || status;
  } catch {
    /* non-critical */
  }

  return { flowId, status, publishError, health };
}

async function setupFlows() {
  const root = path.join(__dirname, '..', 'flows');
  const login = await uploadFlow('Mysogi Login', path.join(root, 'mysogi-login.json'));
  const signup = await uploadFlow('Mysogi Sign Up', path.join(root, 'mysogi-signup.json'));
  const pinSet = await uploadFlow('Mysogi PIN Set', path.join(root, 'mysogi-pin-set.json'));
  const pinVerify = await uploadFlow('Mysogi PIN Verify', path.join(root, 'mysogi-pin-verify.json'));

  const data = {
    loginFlowId: login.flowId,
    signupFlowId: signup.flowId,
    pinSetFlowId: pinSet.flowId,
    pinVerifyFlowId: pinVerify.flowId,
    loginStatus: login.status,
    signupStatus: signup.status,
    pinSetStatus: pinSet.status,
    pinVerifyStatus: pinVerify.status,
    publishWarnings: [login.publishError, signup.publishError, pinSet.publishError, pinVerify.publishError].filter(Boolean),
    updatedAt: new Date().toISOString(),
  };
  saveStored(data);

  return {
    loginFlowId: login.flowId,
    signupFlowId: signup.flowId,
    pinSetFlowId: pinSet.flowId,
    pinVerifyFlowId: pinVerify.flowId,
    login,
    signup,
    pinSet,
    pinVerify,
    publishWarnings: data.publishWarnings,
  };
}

module.exports = { getFlowIds, isReady, setupFlows, loadStored, getFlowHealth, graphError };
