/**
 * Supabase connection & schema test
 * Run: node scripts/test-supabase.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { initSupabase, isSupabaseReady } = require('../src/db/supabase');
const { checkDatabase, signUp, signIn, signOut } = require('../src/auth/supabaseAuth');

const TEST_PHONE = '2349990000001';
const TEST_EMAIL = `test_${Date.now()}@mysogi.test`;
const TEST_PASSWORD = 'testpass123';

async function run() {
  console.log('\n=== Supabase Test ===\n');

  initSupabase();
  console.log('[Config]', isSupabaseReady() ? 'Connected' : 'FAILED — check .env');

  const db = await checkDatabase();
  console.log('[Database]', db.ok ? 'Tables OK' : `FAILED — ${db.message}`);
  if (db.hint) console.log('         ', db.hint);
  if (!db.ok) process.exit(1);

  console.log('\n[Signup]', TEST_EMAIL);
  const signup = await signUp({
    phone: TEST_PHONE,
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    firstName: 'Test',
    lastName: 'User',
  });
  console.log('         ', signup.ok ? 'SUCCESS' : `FAILED — ${signup.message}`);

  if (signup.ok) {
    await signOut(TEST_PHONE);
    const login = await signIn({ phone: TEST_PHONE, email: TEST_EMAIL, password: TEST_PASSWORD });
    console.log('[Login] ', login.ok ? 'SUCCESS' : `FAILED — ${login.message}`);
    if (login.ok) await signOut(TEST_PHONE);
  }

  console.log('\n--- Done ---\n');
  process.exit(signup.ok ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
