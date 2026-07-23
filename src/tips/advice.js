/**
 * Occasional short tips on the main menu.
 */

const TIPS = [
  '💡 Save: `save contact Mama 080…`',
  '💡 Then: *500 airtime for Mama*',
  '💡 Share a contact card to buy for them',
  '💡 *remind me Pay rent on 28/07*',
  '💡 Top up once — buy faster next time',
  '💡 *my contacts* · *my reminders*',
];

/** ~25% chance */
function pickTip({ force = false } = {}) {
  if (!force && Math.random() > 0.25) return null;
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}

module.exports = { TIPS, pickTip };
