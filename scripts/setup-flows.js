/**
 * Upload WhatsApp Flow forms (in-app login/signup).
 * Run once: npm run setup-flows
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { setupFlows } = require('../src/flowRegistry');

function printIntegrityHelp() {
  console.log('\n⚠️  Flows uploaded but Meta blocked publishing (Integrity requirements).');
  console.log('Until this is fixed, the bot falls back to secure browser login via your tunnel.\n');
  console.log('Fix in Meta Business Suite:');
  console.log('  1. Complete business verification');
  console.log('  2. Business profile: Legal Name, Country, Website');
  console.log('  3. Add a valid payment method on the WhatsApp account');
  console.log('  4. Re-run: npm run setup-flows\n');
}

setupFlows()
  .then((result) => {
    console.log('\n✅ WhatsApp Flows uploaded\n');
    console.log(`Login  flow ID: ${result.loginFlowId} (${result.login.status})`);
    console.log(`Sign up flow ID: ${result.signupFlowId} (${result.signup.status})`);
    console.log(`PIN set flow ID: ${result.pinSetFlowId} (${result.pinSet.status})`);
    console.log(`PIN verify flow ID: ${result.pinVerifyFlowId} (${result.pinVerify.status})`);
    console.log('\nOptional — add to .env:');
    console.log(`WHATSAPP_FLOW_LOGIN_ID=${result.loginFlowId}`);
    console.log(`WHATSAPP_FLOW_SIGNUP_ID=${result.signupFlowId}`);
    console.log(`WHATSAPP_FLOW_PIN_SET_ID=${result.pinSetFlowId}`);
    console.log(`WHATSAPP_FLOW_PIN_VERIFY_ID=${result.pinVerifyFlowId}`);
    console.log('\nIDs saved to data/whatsapp-flows.json');
    console.log('Restart: npm start\n');

    if (result.publishWarnings.length) {
      printIntegrityHelp();
    }
  })
  .catch((err) => {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('\n❌ Flow upload failed:', msg);
    if (err.response?.data?.error) {
      console.error(JSON.stringify(err.response.data.error, null, 2));
    }
    console.error('\nManual setup in Meta:');
    console.error('1. developers.facebook.com → WhatsApp → Flows');
    console.error('2. Create flow → upload flows/mysogi-login.json → Publish');
    console.error('3. Repeat for flows/mysogi-signup.json');
    console.error('4. Set WHATSAPP_FLOW_LOGIN_ID & WHATSAPP_FLOW_SIGNUP_ID in .env\n');
    process.exit(1);
  });
