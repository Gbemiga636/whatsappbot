/**
 * AutoSyncNG API smoke test (safe — no purchase unless --purchase)
 * Run: npm run test:autosyncng
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const autosyncng = require('../src/providers/autosyncng');
const config = require('../src/config');

async function run() {
  console.log('\n=== AutoSyncNG API Test ===\n');
  console.log('Base URL:', config.bills.autosyncng.baseUrl);
  console.log('Provider:', config.bills.provider);
  console.log('PIN set:', !!config.bills.autosyncng.apiPin);

  const balance = await autosyncng.getBalance();
  if (balance.ok) {
    console.log('[Balance]', `₦${Number(balance.balance).toLocaleString('en-NG')}`);
    if (Number(balance.balance) <= 0) {
      console.log('         ⚠ Wallet is empty — fund your AutoSyncNG account before live purchases.');
    }
  } else {
    console.log('[Balance] FAILED —', balance.message);
    process.exit(1);
  }

  const catalogs = await autosyncng.getCatalogs();
  console.log('[Catalogs]');
  console.log('  Airtime products:', catalogs.airtime?.products?.length || 0);
  console.log('  Data gifting:', catalogs.data?.products?.length || 0);
  console.log('  Data SME:', catalogs.dataSme?.products?.length || 0);
  console.log('  Electricity:', catalogs.electricity?.products?.length || 0);
  console.log('  Cable TV:', catalogs.cable?.products?.length || 0);

  const resolveNet = process.argv.find((a) => a.startsWith('--network='))?.split('=')[1] || 'MTN';
  const resolvePlan = process.argv.find((a) => a.startsWith('--plan='))?.split('=')[1] || '1GB';
  const resolved = await autosyncng.resolveDataPlan(resolveNet, resolvePlan);
  console.log(
    `[Resolve ${resolveNet} ${resolvePlan}]`,
    resolved.ok ? `${resolved.planName} ₦${resolved.amount}` : resolved.message
  );

  const billChecks = [
    { type: 'electricity', provider: 'IKEDC', meter: '00000000000', amount: 1000 },
    { type: 'dstv', smartcard: '0000000000', amount: 15700 },
  ];
  for (const bill of billChecks) {
    if (!config.bills.autosyncng.apiPin) {
      console.log(`[Bill ${bill.type}] skipped — set AUTOSYNCNG_API_PIN to test`);
      continue;
    }
    const result = await autosyncng.payBill(bill);
    const label = result.ok ? 'API OK' : result.message.includes('insufficient') || result.message.includes('balance') ? 'API OK (needs funding)' : 'check';
    console.log(`[Bill ${bill.type}]`, label, '—', result.message.slice(0, 80));
  }

  if (!process.argv.includes('--purchase')) {
    console.log('\nSkipping purchase. Add --purchase --phone=080... --amount=100 to test live airtime.\n');
    process.exit(0);
  }

  if (!config.bills.autosyncng.apiPin) {
    console.error('Set AUTOSYNCNG_API_PIN in .env for purchases');
    process.exit(1);
  }

  const phone = process.argv.find((a) => a.startsWith('--phone='))?.split('=')[1];
  const amount = Number(process.argv.find((a) => a.startsWith('--amount='))?.split('=')[1] || 100);
  const network = process.argv.find((a) => a.startsWith('--network='))?.split('=')[1] || 'MTN';

  if (!phone) {
    console.error('Use --phone=08012345678');
    process.exit(1);
  }

  console.log(`\n[Airtime] ${network} ₦${amount} → ${phone}...`);
  const airtime = await autosyncng.purchaseAirtime({ network, phone, amount, type: 'airtime' });
  console.log('[Airtime]', airtime.ok ? 'SUCCESS' : 'FAILED', '—', airtime.message);
  process.exit(airtime.ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
