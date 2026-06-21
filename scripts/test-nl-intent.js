/**
 * Natural language intent smoke tests (no OpenAI required).
 * Run: node scripts/test-nl-intent.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { parseNaturalLanguage } = require('../src/router/intentRouter');

const CASES = [
  { text: 'get me airtime', expect: { action: 'buy_airtime' } },
  { text: 'get me MTN airtime 500', expect: { action: 'buy_airtime', network: 'MTN', amount: 500 } },
  { text: 'Can you help me buy airtel airtime 100 naira for myself', expect: { action: 'buy_airtime', network: 'Airtel', amount: 100 } },
  { text: 'buy MTN 500', expect: { action: 'buy_airtime', network: 'MTN', amount: 500 } },
  { text: 'top up my MTN line with 500', expect: { action: 'buy_airtime', network: 'MTN', amount: 500 } },
  { text: 'buy credit on glo 200', expect: { action: 'buy_airtime', network: 'GLO', amount: 200 } },
  { text: 'buy 2GB MTN data', expect: { action: 'buy_data', network: 'MTN' } },
  { text: 'get me data', expect: { action: 'buy_data' } },
  { text: 'top up wallet 2000', expect: { action: 'topup', service: 'wallet', amount: 2000 } },
  { text: 'top up 2000', expect: { action: 'topup', service: 'wallet', amount: 2000 } },
  { text: 'what is my balance', expect: { action: 'balance', service: 'wallet' } },
  { text: 'pay dstv 7500', expect: { action: 'pay_bill', service: 'bills' } },
];

async function run() {
  console.log('\n=== NL Intent Tests (regex/local) ===\n');
  let passed = 0;

  for (const c of CASES) {
    const intent = await parseNaturalLanguage(c.text);
    const ok =
      intent &&
      intent.action === c.expect.action &&
      (c.expect.service == null || intent.service === c.expect.service) &&
      (c.expect.network == null || intent.params?.network === c.expect.network) &&
      (c.expect.amount == null || intent.params?.amount === c.expect.amount);

    if (ok) passed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  "${c.text}"`);
    if (!ok) {
      console.log('       expected:', c.expect);
      console.log('       got     :', intent ? { service: intent.service, action: intent.action, params: intent.params } : null);
    }
  }

  console.log(`\n--- ${passed}/${CASES.length} passed ---\n`);
  process.exit(passed === CASES.length ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
