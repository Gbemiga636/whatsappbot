/**
 * Test wallet + Paystack initialize
 * Run: node scripts/test-wallet.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { initSupabase } = require('../src/db/supabase');
const wallet = require('../src/wallet/walletService');
const paystack = require('../src/providers/paystack');

async function run() {
  console.log('\n=== Wallet Test ===\n');

  initSupabase();

  const db = await wallet.getBalance('2349990000002');
  console.log('[Balance]', wallet.formatNaira(db));

  const topUp = await wallet.initiateTopUp('2349990000002', 500);
  console.log('[Top-up init]', topUp.ok ? 'SUCCESS' : topUp.message);
  if (topUp.paymentUrl) console.log('         URL:', topUp.paymentUrl.slice(0, 60) + '...');

  console.log('[Paystack configured]', paystack.isConfigured());
  console.log('[Commission 2.5% on ₦1000]', wallet.formatWalletSummary(1000).text);

  console.log('\n--- Run migration 002 if partner tables missing ---\n');
}

run().catch(console.error);
