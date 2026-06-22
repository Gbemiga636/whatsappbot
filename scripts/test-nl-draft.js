/**
 * NL order draft tests
 * Run: node scripts/test-nl-draft.js
 */
const {
  createTelecomDraft,
  mergeDraft,
  getMissingFields,
  createBillDraft,
} = require('../src/router/nlOrderDraft');

let failed = 0;

function assert(name, condition) {
  if (condition) console.log(`PASS  ${name}`);
  else {
    console.log(`FAIL  ${name}`);
    failed++;
  }
}

const phone = '2348012345678';

const draft1 = createTelecomDraft('airtime', { amount: 20, recipient: 'self' }, phone);
assert('airtime 20 missing network only', getMissingFields(draft1).join(',') === 'network');

const merged = mergeDraft(draft1, 'MTN', phone);
assert('MTN fills network', merged.params.network === 'MTN');
assert('amount preserved after MTN', merged.params.amount === 20);
assert('ready after network filled', getMissingFields(merged).length === 0);

const draft2 = createTelecomDraft('airtime', { network: 'Airtel', recipient: 'self' }, phone);
assert('airtime no amount missing amount', getMissingFields(draft2)[0] === 'amount');

const dataDraft = createTelecomDraft('data', { network: 'MTN', plan: '2GB' }, phone);
assert('data with network+plan complete', getMissingFields(dataDraft).length === 0);

const billDraft = createBillDraft({ bill_type: 'dstv', amount: 5000 });
assert('dstv bill missing smartcard', getMissingFields(billDraft)[0] === 'meter');

process.exit(failed > 0 ? 1 : 0);
