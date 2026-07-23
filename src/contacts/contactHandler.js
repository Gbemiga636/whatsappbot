/**
 * Contact card sharing + saved contact management commands.
 */

const whatsapp = require('../whatsapp');
const { setSession, getSession } = require('../sessionStore');
const { getUser, setUser } = require('../userStore');
const { getService } = require('../router/serviceRegistry');
const { createContext } = require('../core/context');
const { requiresAuth, promptLoginRequired } = require('../router/authHandler');
const contactStore = require('./contactStore');

const CONTACT_STEPS = new Set(['contact_card_prompt', 'contact_help']);

function shouldDeferContactToService(session) {
  return (
    session?.activeService === 'airtime' &&
    ['airtime_bulk_recipients', 'airtime_enter_phone'].includes(session.step)
  );
}

function parseContactCommand(text) {
  const t = String(text || '').trim();

  if (/^(?:view\s+)?(?:my\s+)?(?:saved\s+)?contacts?$/i.test(t)) {
    return { action: 'list' };
  }
  if (/^(?:show|list)(?:\s+my)?(?:\s+saved)?\s+contacts?$/i.test(t)) {
    return { action: 'list' };
  }
  if (/^contacts?\s+help$/i.test(t)) {
    return { action: 'help' };
  }

  // Bare "Edit" / "edit contact" (list-row tip tap) → show how to edit
  if (/^(?:edit|update)(?:\s+contact)?$/i.test(t)) {
    return { action: 'edit_prompt' };
  }

  const save = t.match(/^(?:save|add)\s+contact\s+(.+?)\s+(0\d{10}|234\d{10})\s*$/i);
  if (save) return { action: 'save', name: save[1].trim(), phone: save[2] };

  // "edit contact Name 080…" or short "edit Name 080…" / "update teni 070…"
  const edit = t.match(
    /^(?:edit|update)(?:\s+contact)?\s+(.+?)\s+(0\d{10}|\+?234\d{10})\s*$/i
  );
  if (edit) return { action: 'edit', name: edit[1].trim(), phone: edit[2] };

  const del = t.match(/^(?:delete|remove)\s+contact\s+(.+)$/i);
  if (del) return { action: 'delete', name: del[1].trim() };

  const delShort = t.match(/^(?:delete|remove)\s+([a-zA-Z][\w\s'-]{1,40})$/i);
  if (delShort && !/^(contact|contacts|reminder|reminders)$/i.test(delShort[1])) {
    return { action: 'delete', name: delShort[1].trim() };
  }

  return null;
}

async function listContactsMessage(phone) {
  const contacts = await contactStore.listContacts(phone);
  if (!contacts.length) {
    return (
      `*📇 No saved contacts yet*\n\n${contactStore.contactsHelpText()}`
    );
  }
  const lines = contacts.map((c) => contactStore.formatContactLine(c)).join('\n');
  return (
    `*📇 Your saved contacts (${contacts.length})*\n\n` +
    `${lines}\n\n` +
    `_Edit: *edit Name 080…* · Delete: *delete Name*_`
  );
}

async function sendContactsIntro(phone, { force = false } = {}) {
  const user = getUser(phone);
  if (!force && user?.metadata?.contactsTipShown) return false;

  await whatsapp.sendText(phone, contactStore.contactsHelpText());
  setUser(phone, {
    metadata: { ...(user?.metadata || {}), contactsTipShown: true },
  });
  return true;
}

async function handleContactCommand(phone, text) {
  const cmd = parseContactCommand(text);
  if (!cmd) return false;

  if (cmd.action === 'help' || cmd.action === 'edit_prompt') {
    await whatsapp.sendText(
      phone,
      cmd.action === 'edit_prompt'
        ? `✏️ Send: *edit Name 080…*\nOr *delete Name*`
        : contactStore.contactsHelpText()
    );
    return true;
  }

  if (cmd.action === 'list') {
    await whatsapp.sendText(phone, await listContactsMessage(phone));
    return true;
  }

  if (cmd.action === 'save') {
    const result = await contactStore.saveContact(phone, { name: cmd.name, phone: cmd.phone });
    await whatsapp.sendText(
      phone,
      result.ok
        ? `✅ Saved *${result.contact.name}* — ${result.contact.phone}\n\nSay e.g. *MTN 500 airtime for ${result.contact.name}*`
        : `❌ ${result.message}`
    );
    return true;
  }

  if (cmd.action === 'edit') {
    const result = await contactStore.updateContact(phone, cmd.name, { phone: cmd.phone });
    await whatsapp.sendText(
      phone,
      result.ok
        ? `✅ Updated *${result.contact.name}* → ${result.contact.phone}`
        : `❌ ${result.message}`
    );
    return true;
  }

  if (cmd.action === 'delete') {
    const result = await contactStore.deleteContact(phone, cmd.name);
    await whatsapp.sendText(
      phone,
      result.ok
        ? `✅ Removed *${result.contact.name}* from your contacts.`
        : `❌ ${result.message}`
    );
    return true;
  }

  return false;
}

async function handleSharedContact(phone, contactsPayload, session) {
  const shared = contactStore.parseSharedContacts({ contacts: contactsPayload });
  const contact = shared[0];
  if (!contact) {
    await whatsapp.sendText(phone, 'Could not read that contact. Try sharing again or type the number.');
    return true;
  }

  setSession(phone, {
    ...session,
    step: 'contact_card_prompt',
    activeService: 'contacts',
    data: {
      ...(session.data || {}),
      sharedContact: contact,
    },
  });

  await whatsapp.sendButtons(
    phone,
    `*${contact.name}*\n📞 ${contact.phone}\n\nBuy airtime or data for this number?`,
    [
      { id: 'contact_buy_airtime', title: '💳 Airtime' },
      { id: 'contact_buy_data', title: '📶 Data' },
      { id: 'contact_save', title: '📇 Save only' },
    ]
  );
  return true;
}

async function startAirtimeForSharedContact(phone, contact) {
  if (requiresAuth(phone)) {
    await promptLoginRequired(phone);
    return true;
  }
  const airtimeSvc = getService('airtime');
  const session = getSession(phone) || { step: 'idle', data: {} };
  const ctx = createContext(phone, {}, session, getUser(phone));
  await airtimeSvc.startTelecomForContact(ctx, { type: 'airtime', name: contact.name, phone: contact.phone });
  return true;
}

async function startDataForSharedContact(phone, contact) {
  if (requiresAuth(phone)) {
    await promptLoginRequired(phone);
    return true;
  }
  const airtimeSvc = getService('airtime');
  const session = getSession(phone) || { step: 'idle', data: {} };
  const ctx = createContext(phone, {}, session, getUser(phone));
  await airtimeSvc.startTelecomForContact(ctx, { type: 'data', name: contact.name, phone: contact.phone });
  return true;
}

async function handleChoice(phone, choice, session) {
  const contact = session?.data?.sharedContact;
  if (!contact) return false;

  if (choice === 'contact_buy_airtime') {
    await contactStore.saveContact(phone, contact);
    await startAirtimeForSharedContact(phone, contact);
    return true;
  }

  if (choice === 'contact_buy_data') {
    await contactStore.saveContact(phone, contact);
    await startDataForSharedContact(phone, contact);
    return true;
  }

  if (choice === 'contact_save') {
    const result = await contactStore.saveContact(phone, contact);
    await whatsapp.sendText(
      phone,
      result.ok
        ? `✅ Saved *${result.contact.name}* — ${result.contact.phone}\n\nSay *MTN 500 airtime for ${result.contact.name}* anytime.`
        : `❌ ${result.message}`
    );
    setSession(phone, { step: 'super_menu', activeService: null, data: { authMode: getUser(phone)?.authMode } });
    return true;
  }

  return false;
}

module.exports = {
  parseContactCommand,
  handleContactCommand,
  handleSharedContact,
  handleChoice,
  sendContactsIntro,
  listContactsMessage,
  shouldDeferContactToService,
  CONTACT_STEPS,
};
