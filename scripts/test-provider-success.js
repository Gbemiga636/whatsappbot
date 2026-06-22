/**
 * Provider success message detection tests
 * Run: node scripts/test-provider-success.js
 */
const { isProviderSuccessMessage, normalizeProviderResult } = require('../src/utils/providerSuccess');

const CASES = [
  {
    msg: 'Your order is processed successfully to 09043614284. Update is sent to Webhook.',
    expect: true,
  },
  { msg: 'You provided invalid Plan ID.', expect: false },
  { msg: 'Invalid API_Key or Transaction PIN', expect: false },
  { msg: 'TRANSACTION SUCCESSFUL', expect: true },
];

let passed = 0;
for (const c of CASES) {
  const ok = isProviderSuccessMessage(c.msg) === c.expect;
  if (ok) passed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  "${c.msg.slice(0, 60)}..."`);
}

const normalized = normalizeProviderResult({
  ok: false,
  message: 'Your order is processed successfully to 09043614284. Update is sent to Webhook.',
});
console.log('\nNormalize async success:', normalized.ok ? 'PASS' : 'FAIL');

process.exit(passed === CASES.length && normalized.ok ? 0 : 1);
