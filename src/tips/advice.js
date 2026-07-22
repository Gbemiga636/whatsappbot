/**
 * Occasional tips shown on the main menu.
 */

const TIPS = [
  '💡 *Tip:* Save contacts with `save contact Mama 080…` then say *MTN 500 airtime for Mama*.',
  '💡 *Tip:* Share a WhatsApp contact card — we\'ll ask if you want airtime or data for that number.',
  '💡 *Tip:* Top up your wallet once, then buy airtime & bills instantly without re-entering card details.',
  '💡 *Tip:* Bulk airtime — send the same amount to many numbers: tap *Bulk airtime* or list numbers.',
  '💡 *Tip:* We auto-detect network from the phone number. Tap *Change network* if it\'s wrong (ported lines).',
  '💡 *Tip:* Set reminders — `remind me Pay rent on 28/07` and we\'ll ping you on WhatsApp.',
  '💡 *Tip:* Type naturally: *buy 500 airtime for 080…* or *fund SportyBet 2000*.',
  '💡 *Tip:* Guests pay with Paystack at checkout. Create an account to unlock wallet + history.',
  '💡 *Tip:* Say *my reminders* anytime to see upcoming alerts.',
  '💡 *Tip:* Say *my contacts* to view, edit, or delete saved numbers.',
];

/** ~35% chance, or forced */
function pickTip({ force = false } = {}) {
  if (!force && Math.random() > 0.35) return null;
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}

module.exports = { TIPS, pickTip };
