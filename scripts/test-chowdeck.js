/**
 * Chowdeck API smoke test — reads credentials from .env only.
 * Usage: npm run test:chowdeck
 */

require('dotenv').config();
const chowdeck = require('../src/providers/chowdeck');

async function main() {
  if (!chowdeck.isConfigured()) {
    console.error('Set CHOWDECK_API_KEY in .env');
    process.exit(1);
  }

  console.log('Listing vendors…');
  const vendors = await chowdeck.listVendors();
  if (!vendors.ok) {
    console.error('Failed:', vendors.message);
    process.exit(1);
  }
  console.log(`Found ${vendors.vendors.length} vendor(s)`);
  const sample = vendors.vendors[0];
  if (sample) {
    console.log('Sample:', sample.name, sample.reference);
    const items = await chowdeck.listMenuItems(sample.reference);
    console.log('Menu items:', items.ok ? items.items.length : items.message);
  }
  console.log('OK');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
