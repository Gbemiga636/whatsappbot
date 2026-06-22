/**
 * Serialize wallet balance mutations per phone (prevents race double-refunds on serverless).
 */
const chains = new Map();

async function withWalletLock(phone, fn) {
  const key = String(phone || '');
  const prev = chains.get(key) || Promise.resolve();

  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  chains.set(key, prev.then(() => gate));

  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (chains.get(key) === gate) chains.delete(key);
  }
}

module.exports = { withWalletLock };
