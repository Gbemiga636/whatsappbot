/**
 * Wallet purchase/refund logic tests (no DB required for lock/idempotency checks)
 * Run: node scripts/test-wallet-purchase.js
 */
const { isProviderSuccessMessage, normalizeProviderResult } = require('../src/utils/providerSuccess');

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}`);
  }
}

assert(
  'async success is not treated as failure',
  normalizeProviderResult({
    ok: false,
    message: 'Your order is processed successfully to 09043614284. Update is sent to Webhook.',
  }).ok === true
);

assert(
  'real failure still fails',
  normalizeProviderResult({ ok: false, message: 'Invalid Plan ID' }).ok === false
);

assert(
  'timeout should not match success',
  !isProviderSuccessMessage('timeout of 45000ms exceeded')
);

(async () => {
  const { withWalletLock } = require('../src/wallet/walletLock');
  let counter = 0;
  const results = await Promise.all([
    withWalletLock('2348012345678', async () => {
      counter += 1;
      await new Promise((r) => setTimeout(r, 30));
      return counter;
    }),
    withWalletLock('2348012345678', async () => {
      counter += 1;
      return counter;
    }),
  ]);
  assert('wallet lock serializes concurrent ops', results[0] === 1 && results[1] === 2);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
