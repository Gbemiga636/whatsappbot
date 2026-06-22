/**
 * Signup parser tests
 * Run: node scripts/test-signup-parse.js
 */
const { parseSignupBulk } = require('../src/flows/supabaseAuthFlow');

const CASES = [
  {
    input: 'Ada | Okafor | ada@email.com | mypass123',
    ok: true,
  },
  {
    input: 'Ada, Okafor, ada@email.com, mypass123',
    ok: true,
  },
  {
    input: 'Ada Okafor ada@email.com mypass123',
    ok: false,
  },
  {
    input: 'A | B | bad-email | secret1',
    ok: false,
  },
];

let failed = 0;
for (const c of CASES) {
  const result = parseSignupBulk(c.input);
  const pass = result.ok === c.ok;
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.input.slice(0, 50)}`);
}

process.exit(failed > 0 ? 1 : 0);
