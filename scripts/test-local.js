/**
 * Local smoke tests (no WhatsApp message sent unless --send flag).
 * Run: node scripts/test-local.js
 *      node scripts/test-local.js --send 2349043614284
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const axios = require('axios');

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN;

async function run() {
  const results = [];

  // 1. Health
  try {
    const { data, status } = await axios.get(`${BASE}/health`, { timeout: 5000 });
    results.push({
      name: 'Health endpoint',
      ok: status === 200 && data.ok === true,
      detail: JSON.stringify(data),
    });
  } catch (e) {
    results.push({
      name: 'Health endpoint',
      ok: false,
      detail: `Server not running? Start with: npm start — ${e.message}`,
    });
  }

  // 2. Webhook verification (Meta handshake)
  try {
    const challenge = 'test_challenge_12345';
    const { data, status } = await axios.get(`${BASE}/webhook`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY,
        'hub.challenge': challenge,
      },
      timeout: 5000,
    });
    results.push({
      name: 'Webhook verify (GET)',
      ok: status === 200 && data === challenge,
      detail: status === 200 ? `Returned challenge OK` : `Status ${status}`,
    });
  } catch (e) {
    results.push({
      name: 'Webhook verify (GET)',
      ok: false,
      detail: e.response?.status === 403 ? 'Wrong WHATSAPP_VERIFY_TOKEN' : e.message,
    });
  }

  // 3. Webhook reject bad token
  try {
    await axios.get(`${BASE}/webhook`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'x',
      },
      validateStatus: () => true,
      timeout: 5000,
    });
    const bad = await axios.get(`${BASE}/webhook`, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'x',
      },
      validateStatus: () => true,
      timeout: 5000,
    });
    results.push({
      name: 'Webhook rejects bad token',
      ok: bad.status === 403,
      detail: `Status ${bad.status} (expected 403)`,
    });
  } catch (e) {
    results.push({ name: 'Webhook rejects bad token', ok: false, detail: e.message });
  }

  // 4. Simulated incoming "hi" message
  try {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'TEST',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID },
                contacts: [{ profile: { name: 'Tester' }, wa_id: '2340000000000' }],
                messages: [
                  {
                    from: '2340000000000',
                    id: 'wamid.TEST',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: 'menu' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };
    const { status } = await axios.post(`${BASE}/webhook`, payload, {
      timeout: 15000,
      validateStatus: () => true,
    });
    results.push({
      name: 'Webhook POST (simulated "menu")',
      ok: status === 200,
      detail: `Status ${status} — check server logs; may call WhatsApp API`,
    });
  } catch (e) {
    results.push({ name: 'Webhook POST (simulated "menu")', ok: false, detail: e.message });
  }

  // 5. Meta API token check (optional)
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (token && phoneId) {
    try {
      const { data, status } = await axios.get(
        `https://graph.facebook.com/v21.0/${phoneId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
          validateStatus: () => true,
        }
      );
      results.push({
        name: 'Meta API (phone number ID)',
        ok: status === 200,
        detail:
          status === 200
            ? `Connected: ${data.display_phone_number || data.verified_name || 'OK'}`
            : `HTTP ${status}: ${data?.error?.message || JSON.stringify(data)}`,
      });
    } catch (e) {
      results.push({ name: 'Meta API (phone number ID)', ok: false, detail: e.message });
    }
  }

  // Optional: send real test message
  const sendTo = process.argv.find((a) => a.startsWith('--send'));
  const to = sendTo ? process.argv[process.argv.indexOf(sendTo) + 1] : null;
  if (to && token && phoneId) {
    try {
      const { status, data } = await axios.post(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to.replace(/\D/g, ''),
          type: 'text',
          text: {
            body: 'Mysogi bot test OK — reply *menu* to start creating an ad.',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          validateStatus: () => true,
          timeout: 15000,
        }
      );
      results.push({
        name: `Send WhatsApp to ${to}`,
        ok: status === 200,
        detail: status === 200 ? `Message ID: ${data.messages?.[0]?.id}` : data?.error?.message || JSON.stringify(data),
      });
    } catch (e) {
      results.push({ name: `Send WhatsApp to ${to}`, ok: false, detail: e.message });
    }
  }

  console.log('\n=== Mysogi WhatsApp Bot — Test Results ===\n');
  let passed = 0;
  for (const r of results) {
    const icon = r.ok ? 'PASS' : 'FAIL';
    if (r.ok) passed++;
    console.log(`[${icon}] ${r.name}`);
    console.log(`       ${r.detail}\n`);
  }
  console.log(`--- ${passed}/${results.length} passed ---\n`);
  process.exit(passed === results.length ? 0 : 1);
}

run();
