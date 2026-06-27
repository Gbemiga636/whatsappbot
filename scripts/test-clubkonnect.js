/**
 * ClubKonnect API smoke test
 * Run: npm run test:clubkonnect
 * Live airtime: npm run test:clubkonnect -- --purchase --phone=09043614284 --network=AIRTEL --amount=100
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const clubkonnect = require('../src/providers/clubkonnect');
const config = require('../src/config');

async function run() {
  console.log('\n=== ClubKonnect API Test ===\n');
  console.log('Base URL:', config.bills.clubkonnect.baseUrl);
  console.log('Provider:', config.bills.provider);
  console.log('User ID set:', !!config.bills.clubkonnect.userId);
  console.log('API key set:', !!config.bills.clubkonnect.apiKey);

  if (!config.bills.clubkonnect.userId || !config.bills.clubkonnect.apiKey) {
    console.error('\nSet CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY in .env');
    console.error('User ID is your ClubKonnect login username (often your phone number).\n');
    process.exit(1);
  }

  const ip = await clubkonnect.checkServerIp();
  if (ip.raw) {
    console.log('[Server IP]', ip.raw.ipaddress || ip.raw.IPAddress || JSON.stringify(ip.raw).slice(0, 120));
  }

  const balance = await clubkonnect.getBalance();
  if (balance.ok) {
    console.log('[Balance]', `₦${Number(balance.balance).toLocaleString('en-NG')}`);
    if (Number(balance.balance) <= 0) {
      console.log('         ⚠ Wallet is empty — fund your ClubKonnect account before live purchases.');
    }
  } else {
    console.log('[Balance] FAILED —', balance.message);
    process.exit(1);
  }

  const catalogs = await clubkonnect.getCatalogs();
  console.log('[Catalogs]');
  console.log('  Data plans:', catalogs.dataPlans?.length || 0);
  console.log('  Electricity:', catalogs.electricity ? 'loaded' : 'none');
  console.log('  Cable TV:', catalogs.cable ? 'loaded' : 'none');

  const resolveNet = process.argv.find((a) => a.startsWith('--network='))?.split('=')[1] || 'AIRTEL';
  const resolvePlan = process.argv.find((a) => a.startsWith('--plan='))?.split('=')[1] || '1GB';
  const resolved = await clubkonnect.resolveDataPlan(resolveNet, resolvePlan);
  console.log(
    `[Resolve ${resolveNet} ${resolvePlan}]`,
    resolved.ok ? `${resolved.planName} ₦${resolved.amount}` : resolved.message
  );

  if (!process.argv.includes('--purchase')) {
    console.log('\nSkipping purchase. Add --purchase --phone=080... --amount=100 to test live airtime.');
    console.log('Note: ClubKonnect minimum airtime is ₦100.\n');
    process.exit(0);
  }

  const phone = process.argv.find((a) => a.startsWith('--phone='))?.split('=')[1];
  const amount = Number(process.argv.find((a) => a.startsWith('--amount='))?.split('=')[1] || 100);
  const network = process.argv.find((a) => a.startsWith('--network='))?.split('=')[1] || 'MTN';

  if (!phone) {
    console.error('Use --phone=08012345678');
    process.exit(1);
  }

  if (amount < 100) {
    console.log(`⚠ Requested ₦${amount} — ClubKonnect minimum is ₦100. Using ₦100 for the test.`);
  }

  console.log(`\n[Airtime] ${network} ₦${Math.max(amount, 100)} → ${phone}...`);
  const airtime = await clubkonnect.purchaseAirtime({
    network,
    phone,
    amount: Math.max(amount, 100),
    type: 'airtime',
  });
  console.log('[Airtime]', airtime.ok ? 'SUCCESS' : 'FAILED', '—', airtime.message);
  if (airtime.transactionId) console.log('         Order ID:', airtime.transactionId);
  process.exit(airtime.ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
