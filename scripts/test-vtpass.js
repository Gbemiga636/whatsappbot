/**
 * VTPass smoke test — balance check only by default (no spend).
 * Run: node scripts/test-vtpass.js
 * Live airtime test (spends real money): node scripts/test-vtpass.js --purchase --phone 08012345678 --amount 100
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const vtpass = require('../src/providers/vtpass');
const config = require('../src/config');

async function run() {
  const mode = config.bills.vtpass.sandbox ? 'SANDBOX' : 'LIVE';
  console.log(`\n=== VTPass ${mode} Test ===\n`);

  const balance = await vtpass.getBalance();
  if (balance.ok && balance.balance != null) {
    console.log('[Balance]', `₦${Number(balance.balance).toLocaleString('en-NG')}`);
  } else {
    console.log('[Balance] FAILED');
    console.log('         ', balance.message);
    if (balance.httpStatus) console.log('          HTTP:', balance.httpStatus);
    if (balance.raw) console.log('          Detail:', JSON.stringify(balance.raw));
    console.log(
      '\nIf HTTP 401: confirm these are LIVE keys from https://vtpass.com (not sandbox),\n' +
        'API access is enabled on your profile, and keys are copied exactly.\n'
    );
    process.exit(1);
  }

  const doPurchase = process.argv.includes('--purchase');
  if (!doPurchase) {
    console.log('\nKeys OK. Skipping purchase (use --purchase to test a real recharge).\n');
    process.exit(0);
  }

  const phoneArg = process.argv.find((a) => a.startsWith('--phone='));
  const amountArg = process.argv.find((a) => a.startsWith('--amount='));
  const phone = phoneArg ? phoneArg.split('=')[1] : config.bills.vtpass.sandbox ? '08011111111' : null;
  const amount = amountArg ? Number(amountArg.split('=')[1]) : 100;

  if (!phone) {
    console.error('Live purchase requires --phone=08012345678');
    process.exit(1);
  }

  const airtime = await vtpass.purchaseAirtime({
    network: 'MTN',
    phone,
    amount,
    type: 'airtime',
  });

  console.log('[Airtime]', airtime.ok ? 'SUCCESS' : 'FAILED');
  console.log('         ', airtime.message);
  if (airtime.transactionId) console.log('          TxID:', airtime.transactionId);
  if (airtime.raw?.requestId) console.log('    request_id:', airtime.raw.requestId);

  process.exit(airtime.ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
