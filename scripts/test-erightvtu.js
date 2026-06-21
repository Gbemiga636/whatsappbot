/**
 * ERight VTU (Sabuss API) smoke test
 * Run: npm run test:erightvtu
 * Live airtime: node scripts/test-erightvtu.js --purchase --phone=08012345678 --amount=100
 * Data plan lookup: node scripts/test-erightvtu.js --resolve --network=MTN --plan=1GB
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const erightvtu = require('../src/providers/erightvtu');
const config = require('../src/config');

async function run() {
  console.log('\n=== ERight VTU (Sabuss API) Test ===\n');
  console.log('Base URL:', config.bills.erightvtu.baseUrl);
  console.log('Provider:', config.bills.provider);

  const balance = await erightvtu.getBalance();
  if (balance.ok) {
    console.log('[Balance]', balance.balance != null ? `₦${Number(balance.balance).toLocaleString('en-NG')}` : 'OK (see raw)');
    if (balance.raw) console.log('         ', JSON.stringify(balance.raw).slice(0, 200));
  } else {
    console.log('[Balance] FAILED —', balance.message);
    if (balance.raw) console.log('          ', JSON.stringify(balance.raw).slice(0, 300));
  }

  const plans = await erightvtu.fetchDataPlans();
  console.log('[Data plans]', plans.length ? `${plans.length} loaded` : 'none');
  if (plans[0]) console.log('          sample:', plans[0].planName, '→ plan_id', plans[0].planId, '₦' + plans[0].amount);

  const airtimePlans = await erightvtu.fetchAirtimePlans();
  console.log('[Airtime plans]', airtimePlans.length ? airtimePlans.map((p) => `${p.planName}=${p.planId}`).join(', ') : 'none');

  const resolveNet = process.argv.find((a) => a.startsWith('--network='))?.split('=')[1] || 'MTN';
  const resolvePlan = process.argv.find((a) => a.startsWith('--plan='))?.split('=')[1] || '1GB';
  if (process.argv.includes('--resolve') || plans.length) {
    const resolved = await erightvtu.resolveDataPlan(resolveNet, resolvePlan);
    console.log(`[Resolve ${resolveNet} ${resolvePlan}]`, resolved.ok ? `plan_id ${resolved.planId} ₦${resolved.amount}` : resolved.message);
  }

  if (!process.argv.includes('--purchase')) {
    console.log('\nSkipping purchase. Use --purchase --phone=080... --amount=100 for live airtime.\n');
    process.exit(balance.ok && plans.length ? 0 : 1);
  }

  const phoneArg = process.argv.find((a) => a.startsWith('--phone='));
  const amountArg = process.argv.find((a) => a.startsWith('--amount='));
  const phone = phoneArg?.split('=')[1];
  const amount = amountArg ? Number(amountArg.split('=')[1]) : 100;

  if (!phone) {
    console.error('Use --phone=08012345678 for live purchase test');
    process.exit(1);
  }

  console.log(`\n[Airtime] Buying MTN ₦${amount} → ${phone}...`);
  const airtime = await erightvtu.purchaseAirtime({
    network: 'MTN',
    phone,
    amount,
    type: 'airtime',
  });

  console.log('[Airtime]', airtime.ok ? 'SUCCESS' : 'FAILED');
  console.log('         ', airtime.message);
  if (airtime.transactionId) console.log('          Ref:', airtime.transactionId);
  if (airtime.raw) console.log('          Raw:', JSON.stringify(airtime.raw).slice(0, 300));
  process.exit(airtime.ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
