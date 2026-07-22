const whatsapp = require('../whatsapp');
const { getSession, setSession, clearSession } = require('../sessionStore');
const {
  saveCampaign,
  getCampaignsByPhone,
  formatCampaignForUser,
} = require('../campaignStore');
const { AD_TYPES, NIGERIAN_STATES } = require('../campaignTypes');
const {
  createCampaignOnPlatform,
  fetchUserCampaigns,
  getWalletBalance,
  estimateCampaignCost,
  formatNaira,
} = require('../mysogiApi');
const { buildUrl } = require('../mysogiLinks');
const { downloadWhatsAppMedia, formatCreativeLabel } = require('../mediaService');
const { setUser, isAuthenticated, getUser } = require('../userStore');
const {
  showWelcomeAuth,
  showAppMenu,
  openLoginForm,
  openSignupForm,
  startOtpLogin,
  startSignup,
  handleOtpEmail,
  handleOtpCode,
  handleSignupInput,
} = require('./authFlow');
const {
  showBillboardTypeFilter,
  showBillboardCatalogAndPicker,
  showBillboardDetailAndDuration,
  applyDurationSelection,
  formatBillboardSummaryForConfirm,
  getBillboardById,
  getAllBillboards,
} = require('./billboardFlow');

const STEPS = {
  IDLE: 'idle',
  AUTH_GATE: 'auth_gate',
  AUTH_OTP_EMAIL: 'auth_otp_email',
  AUTH_OTP_CODE: 'auth_otp_code',
  AUTH_SIGNUP: 'auth_signup',
  MAIN_MENU: 'main_menu',
  PICK_AD_TYPE: 'pick_ad_type',
  CAMPAIGN_NAME: 'campaign_name',
  BILLBOARD_TYPE_FILTER: 'billboard_type_filter',
  BILLBOARD_SELECT: 'billboard_select',
  BILLBOARD_DURATION: 'billboard_duration',
  SMS_STATE: 'sms_state',
  SMS_GENDER: 'sms_gender',
  SMS_MESSAGE: 'sms_message',
  DISPLAY_URL: 'display_url',
  VOICE_SCRIPT: 'voice_script',
  INFLUENCER_BRIEF: 'influencer_brief',
  MINI_WEBSITE_BUSINESS: 'mini_website_business',
  APP_NAME: 'app_name',
  APP_STORE_URL: 'app_store_url',
  AD_COPY: 'ad_copy',
  CREATIVE: 'creative',
  BUDGET: 'budget',
  CONTACT_NAME: 'contact_name',
  EMAIL: 'email',
  NOTES: 'notes',
  CONFIRM: 'confirm',
  AWAIT_TOPUP: 'await_topup',
};

function normalizeInput(text) {
  return (text || '').trim().toLowerCase();
}

const GREETING_WORDS = new Set([
  'menu',
  'start',
  'hi',
  'hello',
  'help',
  '0',
  'home',
  'hey',
  'hiya',
  'howdy',
  'good day',
  'goodday',
  'good morning',
  'good afternoon',
  'good evening',
  'morning',
  'afternoon',
  'evening',
  'greetings',
  'hola',
  'sup',
  'yo',
]);

function isMenuCommand(text) {
  const t = normalizeInput(text);
  if (!t) return false;
  if (GREETING_WORDS.has(t)) return true;
  if (t.startsWith('good ')) return true;
  if (/^(hi|hello|hey)[\s,!?.]*$/.test(t) || /^(hi|hello|hey)\s/.test(t)) return true;
  return false;
}

function isCancelCommand(text) {
  const t = normalizeInput(text);
  return ['cancel', 'stop', 'quit', 'exit'].includes(t);
}

async function reply(to, text) {
  await whatsapp.sendText(to, text);
}

async function showMainMenu(to) {
  const session = getSession(to);
  const data = session?.data || {};
  const next = await showAppMenu(to, data);
  setSession(to, { step: STEPS.MAIN_MENU, data: next.data });
}

async function showWallet(to) {
  const user = getUser(to);
  if (!isAuthenticated(to) || !user?.mysogiToken) {
    await reply(to, 'Log in first to view your Bygate wallet.\n\nType *login* to continue.');
    return showMainMenu(to);
  }

  const balance = await getWalletBalance(user.mysogiToken);
  let msg = '*Your Bygate wallet*\n\n';
  if (balance.ok) {
    msg += `Balance: *${balance.formatted}*\n\n`;
  } else {
    msg += '_Could not load balance right now. Open the website to check._\n\n';
  }
  msg += 'Top up on the website — same wallet used for ads created here.';

  await reply(to, msg);
  await whatsapp.sendCtaUrl(
    to,
    'Manage your wallet and payment history on Bygate.',
    'Open wallet',
    buildUrl('wallet', to)
  );
}

async function showAdTypeList(to) {
  setSession(to, { step: STEPS.PICK_AD_TYPE, data: getSession(to)?.data || {} });

  if (!isAuthenticated(to)) {
    await reply(
      to,
      '_Tip: Log in first so your ad is created on mysogi.com.ng and paid from your wallet._'
    );
  }

  const rows = Object.values(AD_TYPES).map((t) => ({
    id: t.id,
    title: t.label,
    description: t.description,
  }));

  await whatsapp.sendList(
    to,
    '*Create an Ad Campaign*\n\n' +
      'Create New Ad to tap into our massive and diverse customer base.\n\n' +
      'Select your ad type:',
    'Select ad type',
    [{ title: 'Bygate ad types', rows }]
  );
}

async function showSmsStatePicker(to, data) {
  setSession(to, { step: STEPS.SMS_STATE, data });
  const rows = NIGERIAN_STATES.slice(0, 10).map((s, i) => ({
    id: `state_${i}`,
    title: s,
    description: 'Target this state',
  }));
  rows.push({ id: 'state_other', title: 'Other / Nationwide', description: 'Broader reach' });

  await whatsapp.sendList(
    to,
    '*Smart SMS Ads*\n\nWhich state should we target first?',
    'Pick state',
    [{ title: 'States', rows }]
  );
}

async function askContactName(to, data) {
  const user = getUser(to);
  if (isAuthenticated(to) && user?.firstName) {
    data.contactName = `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`.trim();
    data.email = user.email;
    data.userEmail = user.email;
    data.mysogiToken = user.mysogiToken;
    return askNotes(to, data);
  }
  setSession(to, { step: STEPS.CONTACT_NAME, data });
  await reply(to, 'Almost done! What is your *full name*?');
}

async function askEmail(to, data) {
  setSession(to, { step: STEPS.EMAIL, data });
  await reply(to, 'Your *email* (used on Bygate dashboard):');
}

async function askCreative(to, data) {
  if (!data.creatives) data.creatives = [];
  setSession(to, { step: STEPS.CREATIVE, data });

  await reply(
    to,
    `*Send your ad creative*\n\n` +
      `Upload directly in this chat:\n` +
      `📷 Image (JPG, PNG)\n` +
      `📄 PDF / design file\n` +
      `🎬 Video (MP4)\n\n` +
      `Send *multiple files* if needed. Add a caption to describe each one.\n\n` +
      `When you're finished, tap *Done* below.`
  );

  await whatsapp.sendButtons(to, 'Finished uploading?', [
    { id: 'creative_done', title: 'Done ✓' },
    { id: 'creative_skip', title: 'Describe in text' },
  ]);
}

async function afterCreativeStep(to, data) {
  setSession(to, { step: STEPS.BUDGET, data });
  return reply(to, 'Your budget (e.g. ₦100,000) or type *discuss*:');
}

async function askNotes(to, data) {
  setSession(to, { step: STEPS.NOTES, data });
  let prompt =
    'Any extra notes? (creative links, audience, timing)\n\nType *skip* if none.';
  if (data.adType === 'billboard') {
    prompt =
      '*Campaign note:* No contracts · No upfront pricing required.\n\n' +
      'Add any extra notes (creative files, preferred start date, etc.)\n\n' +
      'Type *skip* if none.';
  }
  await reply(to, prompt);
}

async function showConfirmation(to, data) {
  const user = getUser(to);
  const token = data.mysogiToken || user?.mysogiToken;
  const cost = estimateCampaignCost(data);
  data.estimatedCost = cost;

  if (!token) {
    await reply(
      to,
      '⚠️ *Log in first* so this ad is created on your Bygate account and can use your wallet.\n\n' +
        'Type *login* or tap *Login* from the menu, then create your ad again.'
    );
    setSession(to, { step: STEPS.MAIN_MENU, data });
    return showMainMenu(to);
  }

  setSession(to, { step: STEPS.CONFIRM, data });

  const typeLabel = AD_TYPES[data.adType]?.label || data.adType;
  let summary =
    `*Review your campaign*\n\n` +
    `Type: ${typeLabel}\n` +
    `Name: ${data.campaignName}\n` +
    `Contact: ${data.contactName}\n` +
    `Email: ${data.email}\n`;

  if (data.adType === 'billboard') {
    summary += formatBillboardSummaryForConfirm(data);
  }
  if (data.adType === 'smart_sms') {
    summary += `SMS State: ${data.smsState}\nGender: ${data.smsGender}\n`;
  }
  if (data.budget) summary += `Budget: ${data.budget}\n`;
  if (cost > 0) summary += `\n*Cost:* ${formatNaira(cost)}\n`;

  const balance = await getWalletBalance(token);
  if (balance.ok) {
    summary += `*Wallet balance:* ${balance.formatted}\n`;
    data.walletBalance = balance.amount;
    if (cost > 0 && balance.amount < cost) {
      summary += `\n⚠️ Insufficient balance. You'll need to top up before creating this ad.\n`;
    } else if (cost > 0) {
      summary += `_Payment will be taken from your Bygate wallet._\n`;
    }
  }

  if (data.creatives?.length) {
    summary += `\nCreative files: ${data.creatives.length} attached\n`;
    data.creatives.slice(0, 3).forEach((f) => {
      summary += `  · ${formatCreativeLabel(f)}\n`;
    });
  }
  if (data.adCopy || data.message) {
    summary += `Copy: ${(data.adCopy || data.message).slice(0, 80)}${(data.adCopy || data.message).length > 80 ? '…' : ''}\n`;
  }
  if (data.notes) summary += `Notes: ${data.notes}\n`;

  summary += '\nCreate on Bygate and pay from wallet?';

  await whatsapp.sendButtons(to, summary, [
    { id: 'confirm_yes', title: 'Create & pay ✓' },
    { id: 'confirm_no', title: 'Cancel' },
  ]);
}

async function showMyCampaigns(to) {
  const user = getUser(to);
  const local = getCampaignsByPhone(to);
  let header = '*Your campaigns*\n\n';

  if (user?.mysogiToken) {
    const balance = await getWalletBalance(user.mysogiToken);
    if (balance.ok) {
      header += `Wallet: *${balance.formatted}*\n\n`;
    }
  }

  const remote = user?.mysogiToken ? await fetchUserCampaigns(user.mysogiToken) : null;
  const remoteIds = new Set(
    (remote || []).map((c) => String(c.id || c.campaignId || c.platformId || ''))
  );

  if (remote?.length) {
    header += '*On mysogi.com.ng:*\n';
    remote.slice(0, 6).forEach((c, i) => {
      const name = c.name || c.campaignName || c.title || `Campaign ${i + 1}`;
      const type = c.type || c.adType || 'ad';
      const st = c.status || c.state || 'active';
      header += `• *${name}* (${type}) — ${st}\n`;
    });
    header += '\n';
  }

  const localOnly = local.filter((c) => !c.platformId || !remoteIds.has(String(c.platformId)));
  if (localOnly.length) {
    header += `*Created via WhatsApp* (${localOnly.length}):\n\n`;
    const recent = [...localOnly].reverse().slice(0, 6);
    header += recent.map((c) => formatCampaignForUser(c)).join('\n\n');
    header += '\n\n';
  } else if (!remote?.length) {
    header += 'You have no campaigns yet.\n\nTap *Create New Ad* in the menu to start.\n';
    await reply(to, header);
    return;
  }

  header += '_All ads created here while logged in appear on your Bygate dashboard._';

  await reply(to, header);

  if (user?.mysogiToken) {
    await whatsapp.sendCtaUrl(
      to,
      'View full campaign details, analytics, and wallet on the website.',
      'Open dashboard',
      buildUrl('dashboard', to)
    );
  }
}

async function promptTopUp(to, data, cost, balanceAmount) {
  const shortfall = Math.max(0, cost - (balanceAmount || 0));
  setSession(to, { step: STEPS.AWAIT_TOPUP, data });

  await reply(
    to,
    `⚠️ *Insufficient wallet balance*\n\n` +
      `Ad cost: *${formatNaira(cost)}*\n` +
      `Your balance: *${formatNaira(balanceAmount || 0)}*\n` +
      `You need: *${formatNaira(shortfall)}* more\n\n` +
      `Top up on Bygate — it's the same wallet as the website.`
  );

  await whatsapp.sendCtaUrl(
    to,
    'Add funds to your Bygate wallet, then return here to finish creating your ad.',
    'Top up wallet',
    buildUrl('topup', to)
  );

  await whatsapp.sendButtons(to, 'After topping up:', [
    { id: 'topup_retry', title: 'I topped up ✓' },
    { id: 'confirm_no', title: 'Cancel' },
  ]);
}

async function submitCampaign(to, data) {
  const user = getUser(to);
  const token = data.mysogiToken || user?.mysogiToken;
  const cost = estimateCampaignCost(data);

  if (!token) {
    await reply(
      to,
      '⚠️ Please *log in* so your ad can be created on Bygate and paid from your wallet.'
    );
    setSession(to, { step: STEPS.MAIN_MENU, data });
    return showMainMenu(to);
  }

  const balance = await getWalletBalance(token);
  if (cost > 0 && balance.ok && balance.amount < cost) {
    return promptTopUp(to, data, cost, balance.amount);
  }

  const payload = { phone: to, ...data, estimatedCost: cost };
  if (data.adType === 'billboard') {
    const { BILLBOARD_CAMPAIGN_NOTE } = require('../data/billboards');
    payload.campaignNote = BILLBOARD_CAMPAIGN_NOTE;
  }

  const sync = await createCampaignOnPlatform(payload, token, {
    amount: cost,
    payFromWallet: cost > 0,
  });

  if (!sync.synced) {
    if (sync.reason === 'insufficient_balance') {
      return promptTopUp(to, data, cost, balance.amount ?? 0);
    }
    if (sync.reason === 'auth_required') {
      await reply(
        to,
        '⚠️ Your Bygate session expired. Type *login* to sign in again, then recreate your ad.'
      );
      setUser(to, { mysogiToken: null, authMode: 'guest' });
      clearSession(to);
      return;
    }

    const record = saveCampaign({
      ...payload,
      status: 'pending_sync',
      syncError: sync.reason || 'api_unavailable',
    });
    const ref = record.id.slice(0, 8).toUpperCase();
    clearSession(to);
    await reply(
      to,
      `⏳ *Campaign saved locally* (ref: *${ref}*)\n\n` +
        `We couldn't reach Bygate to create it on the website right now.\n` +
        `Your details are saved — try again later or create it from the dashboard.`
    );
    await whatsapp.sendCtaUrl(
      to,
      'Open your Bygate dashboard to manage campaigns.',
      'Open dashboard',
      buildUrl('dashboard', to)
    );
    return;
  }

  const record = saveCampaign({
    ...payload,
    status: 'live',
    platformId: sync.platformId,
    paidFromWallet: sync.paidFromWallet,
    dashboardUrl: buildUrl('campaigns', to),
  });
  const ref = record.id.slice(0, 8).toUpperCase();
  clearSession(to);

  const typeLabel = AD_TYPES[data.adType]?.label || data.adType;
  const creativeNote = data.creatives?.length
    ? `\nCreative: ${data.creatives.length} file(s) attached`
    : '';
  const payNote =
    cost > 0 ? `\nPaid: *${formatNaira(cost)}* from your Bygate wallet` : '';

  await reply(
    to,
    `✅ *Campaign created on Bygate!*\n\n` +
      `*${data.campaignName}*\n` +
      `Type: ${typeLabel}\n` +
      `Reference: *${ref}*` +
      payNote +
      creativeNote +
      `\n\n✓ Live on *mysogi.com.ng* — view it on your dashboard anytime.`
  );

  await whatsapp.sendCtaUrl(
    to,
    'Your campaign is on your Bygate account. Open the dashboard to track it.',
    'View on site',
    buildUrl('dashboard', to)
  );

  await whatsapp.sendButtons(to, 'What would you like to do next?', [
    { id: 'create', title: 'Create another ad' },
    { id: 'campaigns', title: 'My campaigns' },
    { id: 'menu', title: 'Main menu' },
  ]);
}

async function routeAfterAdType(to, adType, data) {
  data.adType = adType;
  setSession(to, { step: STEPS.CAMPAIGN_NAME, data });
  await reply(
    to,
    `Great choice: *${AD_TYPES[adType]?.label || adType}*\n\n` +
      `What should we *name* this campaign? (e.g. "March Promo Lagos")`
  );
}

async function routeAfterCampaignName(to, data) {
  switch (data.adType) {
    case 'billboard':
      setSession(to, { step: STEPS.BILLBOARD_TYPE_FILTER, data });
      return showBillboardTypeFilter(to, data);
    case 'smart_sms':
      return showSmsStatePicker(to, data);
    case 'display':
      setSession(to, { step: STEPS.DISPLAY_URL, data });
      return reply(to, 'Landing page or offer URL for your display ad:');
    case 'voice':
      setSession(to, { step: STEPS.VOICE_SCRIPT, data });
      return reply(
        to,
        'Paste your *voice script* (or describe the message). You can send audio later via email.'
      );
    case 'influencer':
      setSession(to, { step: STEPS.INFLUENCER_BRIEF, data });
      return reply(
        to,
        'Describe what you want the influencer to post (platform, tone, hashtags):'
      );
    case 'mini_website':
      setSession(to, { step: STEPS.MINI_WEBSITE_BUSINESS, data });
      return reply(to, 'Business / brand name for your free mini website:');
    case 'app_download':
      setSession(to, { step: STEPS.APP_NAME, data });
      return reply(to, 'App name:');
    default:
      setSession(to, { step: STEPS.AD_COPY, data });
      return reply(to, 'Write your ad message / offer text:');
  }
}

async function continueFlow(to, session, incoming) {
  const { step, data = {} } = session;
  const text = incoming.text || '';
  const buttonId = incoming.buttonId || '';
  const listId = incoming.listId || '';
  const mediaMessage = incoming.media || null;

  if (isCancelCommand(text)) {
    clearSession(to);
    await reply(to, 'Campaign cancelled. Type *menu* to start again.');
    return;
  }

  // Global menu / greetings
  if (isMenuCommand(text) || buttonId === 'menu' || listId === 'menu') {
    const next = await showWelcomeAuth(to);
    const step = next.step === 'main_menu' ? STEPS.MAIN_MENU : STEPS.AUTH_GATE;
    setSession(to, { step, data: next.data });
    return;
  }

  switch (step) {
    case STEPS.IDLE: {
      const next = await showWelcomeAuth(to);
      const step = next.step === 'main_menu' ? STEPS.MAIN_MENU : STEPS.AUTH_GATE;
      setSession(to, { step, data: next.data });
      return;
    }

    case STEPS.AUTH_GATE: {
      if (buttonId === 'auth_guest' || listId === 'auth_guest') {
        setUser(to, { authMode: 'guest' });
        const next = await showAppMenu(to, { ...data, authMode: 'guest' });
        setSession(to, { step: STEPS.MAIN_MENU, data: next.data });
        return;
      }
      if (buttonId === 'auth_login' || listId === 'auth_login' || normalizeInput(text) === 'login') {
        const next = await startOtpLogin(to);
        setSession(to, { step: STEPS.AUTH_OTP_EMAIL, data: { ...data, ...next.data } });
        return;
      }
      if (
        buttonId === 'auth_signup' ||
        listId === 'auth_signup' ||
        normalizeInput(text) === 'signup' ||
        normalizeInput(text) === 'register'
      ) {
        const next = await startSignup(to);
        setSession(to, { step: STEPS.AUTH_SIGNUP, data: { ...data, ...next.data } });
        return;
      }
      await reply(to, 'Tap *Login with OTP*, *Create account*, or *Continue as guest*.');
      return;
    }

    case STEPS.AUTH_SIGNUP: {
      const next = await handleSignupInput(to, { text, buttonId, listId }, data);
      if (!next) return;
      const step = next.step === 'auth_signup' ? STEPS.AUTH_SIGNUP : STEPS.MAIN_MENU;
      setSession(to, { step, data: next.data });
      return;
    }

    case STEPS.AUTH_OTP_EMAIL: {
      if (!text?.trim()) {
        await reply(to, 'Send your Bygate email address, or type *menu* to cancel.');
        return;
      }
      const next = await handleOtpEmail(to, text, data);
      if (next) setSession(to, { step: STEPS.AUTH_OTP_CODE, data: next.data });
      return;
    }

    case STEPS.AUTH_OTP_CODE: {
      if (normalizeInput(text) === 'login') {
        const next = await startOtpLogin(to);
        setSession(to, { step: STEPS.AUTH_OTP_EMAIL, data: { ...data, ...next.data } });
        return;
      }
      if (!text?.trim()) {
        await reply(to, 'Enter the 6-digit code from your email.');
        return;
      }
      const next = await handleOtpCode(to, text, data);
      if (next) setSession(to, { step: STEPS.MAIN_MENU, data: next.data });
      return;
    }

    case STEPS.MAIN_MENU: {
      if (listId === 'auth_login' || buttonId === 'auth_login' || normalizeInput(text) === 'login') {
        const next = await startOtpLogin(to);
        setSession(to, { step: STEPS.AUTH_OTP_EMAIL, data: { ...data, ...next.data } });
        return;
      }
      if (
        listId === 'auth_signup' ||
        buttonId === 'auth_signup' ||
        normalizeInput(text) === 'signup' ||
        normalizeInput(text) === 'register'
      ) {
        const next = await startSignup(to);
        setSession(to, { step: STEPS.AUTH_SIGNUP, data: { ...data, ...next.data } });
        return;
      }
      if (listId === 'logout' || buttonId === 'logout') {
        setUser(to, { authMode: 'guest', email: null, mysogiToken: null });
        await reply(to, 'Logged out. Type *menu* to sign in again.');
        const next = await showWelcomeAuth(to);
        setSession(to, { step: STEPS.AUTH_GATE, data: next.data });
        return;
      }
      if (listId === 'create' || buttonId === 'create') return showAdTypeList(to);
      if (listId === 'types') {
        const lines = Object.values(AD_TYPES)
          .map((t, i) => `${i + 1}. ${t.label} — ${t.description}`)
          .join('\n');
        await reply(to, `*Bygate ad types:*\n\n${lines}\n\nReply *create* or use the menu to start.`);
        return;
      }
      if (listId === 'campaigns' || buttonId === 'campaigns') {
        return showMyCampaigns(to);
      }
      if (listId === 'wallet' || buttonId === 'wallet') {
        return showWallet(to);
      }
      if (listId === 'dashboard' || buttonId === 'dashboard') {
        await whatsapp.sendCtaUrl(
          to,
          'Your Bygate dashboard — same account as WhatsApp.',
          'Open dashboard',
          buildUrl('dashboard', to)
        );
        return;
      }
      if (listId === 'link_account') {
        await openLoginForm(to);
        return;
      }
      if (listId === 'login') {
        await openLoginForm(to);
        return;
      }
      if (listId === 'contact') {
        await reply(
          to,
          '*Bygate Contact*\n9 Adedoyin Ogungbe Crescent, Lekki Phase 1, Lagos\n' +
            '📞 +234 812 088 9773\n✉️ info@mysogi.com.ng'
        );
        return;
      }
      if (normalizeInput(text) === 'create' || buttonId === 'create_ad') {
        return showAdTypeList(to);
      }
      return showMainMenu(to);
    }

    case STEPS.PICK_AD_TYPE: {
      const adType = listId || buttonId;
      if (!AD_TYPES[adType]) {
        await reply(to, 'Please pick an ad type from the list, or type *menu*.');
        return;
      }
      return routeAfterAdType(to, adType, { ...data });
    }

    case STEPS.CAMPAIGN_NAME: {
      if (!text) {
        await reply(to, 'Please enter a campaign name.');
        return;
      }
      data.campaignName = text;
      return routeAfterCampaignName(to, data);
    }

    case STEPS.BILLBOARD_TYPE_FILTER: {
      const filterMap = {
        bb_all: 'all',
        bb_led: 'led',
        bb_static: 'static',
      };
      const filterId = filterMap[buttonId] || filterMap[listId];
      if (!filterId) {
        await reply(to, 'Tap *All*, *LED*, or *Static* to browse billboards.');
        return showBillboardTypeFilter(to, data);
      }
      const next = await showBillboardCatalogAndPicker(to, data, filterId);
      const step =
        next.step === 'billboard_type_filter'
          ? STEPS.BILLBOARD_TYPE_FILTER
          : STEPS.BILLBOARD_SELECT;
      setSession(to, { step, data: next.data });
      return;
    }

    case STEPS.BILLBOARD_SELECT: {
      const pickId = listId || buttonId;
      if (!pickId || pickId.startsWith('bb_')) {
        await reply(to, 'Please select a billboard from the list.');
        const next = await showBillboardCatalogAndPicker(
          to,
          data,
          data.billboardFilter || 'all'
        );
        setSession(to, { step: STEPS.BILLBOARD_SELECT, data: next.data });
        return;
      }
      const next = await showBillboardDetailAndDuration(to, data, pickId);
      setSession(to, { step: STEPS.BILLBOARD_DURATION, data: next.data });
      return;
    }

    case STEPS.BILLBOARD_DURATION: {
      const all = await getAllBillboards();
      const board = getBillboardById(all, data.billboardId);
      if (!board) {
        await reply(to, 'Session expired. Type *menu* to start again.');
        return;
      }
      const validDurations = ['daily', 'weekly', 'monthly'];
      const durationId = listId && validDurations.includes(listId) ? listId : null;
      if (!durationId) {
        await reply(to, 'Select a duration from the list.');
        const next = await showBillboardDetailAndDuration(to, data, data.billboardId);
        setSession(to, { step: STEPS.BILLBOARD_DURATION, data: next.data });
        return;
      }
      applyDurationSelection(data, board, durationId);
      return askCreative(to, data);
    }

    case STEPS.CREATIVE: {
      if (!data.creatives) data.creatives = [];

      if (buttonId === 'creative_done' || normalizeInput(text) === 'done') {
        if (!data.creatives.length && !data.adCopy?.trim()) {
          await reply(to, 'Send at least one file, or tap *Describe in text*.');
          return;
        }
        return afterCreativeStep(to, data);
      }

      if (buttonId === 'creative_skip' || listId === 'creative_skip') {
        setSession(to, { step: STEPS.AD_COPY, data });
        return reply(to, 'Describe your creative in text (headline, visuals, message):');
      }

      if (mediaMessage) {
        await reply(to, '⏳ Saving your file…');
        const result = await downloadWhatsAppMedia(mediaMessage, to);
        if (!result.ok) {
          await reply(to, `❌ ${result.message}\n\nTry again or tap *Describe in text*.`);
          return;
        }
        data.creatives.push(result.file);
        if (result.file.caption) {
          data.adCopy = data.adCopy
            ? `${data.adCopy}\n${result.file.caption}`
            : result.file.caption;
        }
        const count = data.creatives.length;
        await reply(
          to,
          `✅ *Creative saved* (${count} file${count > 1 ? 's' : ''})\n` +
            `${formatCreativeLabel(result.file)}\n\n` +
            `Send another file, or tap *Done* when finished.`
        );
        setSession(to, { step: STEPS.CREATIVE, data });
        await whatsapp.sendButtons(to, 'Finished uploading?', [
          { id: 'creative_done', title: 'Done ✓' },
          { id: 'creative_skip', title: 'Describe in text' },
        ]);
        return;
      }

      if (text?.trim()) {
        data.adCopy = data.adCopy ? `${data.adCopy}\n${text.trim()}` : text.trim();
        setSession(to, { step: STEPS.CREATIVE, data });
        await reply(to, 'Text saved. Send a file or tap *Done* to continue.');
        return;
      }

      await reply(to, 'Send an image, PDF, or video — or tap *Done* / *Describe in text*.');
      return;
    }

    case STEPS.SMS_STATE: {
      if (listId?.startsWith('state_')) {
        const idx = listId === 'state_other' ? -1 : Number(listId.replace('state_', ''));
        data.smsState = idx >= 0 ? NIGERIAN_STATES[idx] : 'Nationwide';
      } else if (text) {
        data.smsState = text;
      } else {
        return showSmsStatePicker(to, data);
      }
      setSession(to, { step: STEPS.SMS_GENDER, data });
      await whatsapp.sendButtons(to, 'Target gender for SMS:', [
        { id: 'gender_all', title: 'All' },
        { id: 'gender_m', title: 'Male' },
        { id: 'gender_f', title: 'Female' },
      ]);
      return;
    }

    case STEPS.SMS_GENDER: {
      const map = { gender_all: 'All', gender_m: 'Male', gender_f: 'Female' };
      data.smsGender = map[buttonId] || text || 'All';
      setSession(to, { step: STEPS.SMS_MESSAGE, data });
      return reply(to, 'Type your *SMS message* (160 chars recommended for 1 segment):');
    }

    case STEPS.SMS_MESSAGE:
      data.message = text;
      setSession(to, { step: STEPS.BUDGET, data });
      return reply(to, 'Estimated budget (e.g. ₦50,000) or type *discuss*:');

    case STEPS.DISPLAY_URL:
      data.landingUrl = text;
      return askCreative(to, data);

    case STEPS.VOICE_SCRIPT:
      data.voiceScript = text;
      setSession(to, { step: STEPS.BUDGET, data });
      return reply(to, 'Estimated budget or type *discuss*:');

    case STEPS.INFLUENCER_BRIEF:
      data.influencerBrief = text;
      return askCreative(to, data);

    case STEPS.MINI_WEBSITE_BUSINESS:
      data.businessName = text;
      return askCreative(to, data);

    case STEPS.APP_NAME:
      data.appName = text;
      setSession(to, { step: STEPS.APP_STORE_URL, data });
      return reply(to, 'Play Store / App Store link:');

    case STEPS.APP_STORE_URL:
      data.appStoreUrl = text;
      setSession(to, { step: STEPS.BUDGET, data });
      return reply(to, 'Campaign budget (daily or total):');

    case STEPS.AD_COPY:
      data.adCopy = text;
      return afterCreativeStep(to, data);

    case STEPS.BUDGET:
      data.budget = text || 'To be discussed';
      return askContactName(to, data);

    case STEPS.CONTACT_NAME:
      data.contactName = text;
      if (data.userEmail || isAuthenticated(to)) {
        const u = getSession(to)?.data;
        data.email = data.userEmail || u?.userEmail;
        return askNotes(to, data);
      }
      return askEmail(to, data);

    case STEPS.EMAIL: {
      if (!text.includes('@')) {
        await reply(to, 'Please enter a valid email.');
        return;
      }
      data.email = text;
      return askNotes(to, data);
    }

    case STEPS.NOTES:
      data.notes = normalizeInput(text) === 'skip' ? '' : text;
      return showConfirmation(to, data);

    case STEPS.CONFIRM:
      if (buttonId === 'confirm_yes' || normalizeInput(text) === 'yes') {
        return submitCampaign(to, data);
      }
      clearSession(to);
      await reply(to, 'Not submitted. Type *menu* to try again.');
      return;

    case STEPS.AWAIT_TOPUP:
      if (buttonId === 'topup_retry' || normalizeInput(text) === 'retry') {
        return submitCampaign(to, data);
      }
      if (buttonId === 'confirm_no' || isCancelCommand(text)) {
        clearSession(to);
        await reply(to, 'Campaign cancelled. Type *menu* to start again.');
        return;
      }
      await reply(to, 'Top up your wallet on Bygate, then tap *I topped up* — or type *cancel*.');
      return;

    default:
      return showMainMenu(to);
  }
}

async function handleIncomingMessage(from, message) {
  const isMedia = ['image', 'document', 'video', 'audio'].includes(message.type);
  const incoming = {
    text: message.text?.body || message.button?.text || '',
    buttonId: message.interactive?.button_reply?.id || '',
    listId: message.interactive?.list_reply?.id || '',
    media: isMedia ? message : null,
  };

  if (!incoming.text && !incoming.buttonId && !incoming.listId && !incoming.media) {
    return;
  }

  let session = getSession(from);
  if (!session) {
    session = { step: STEPS.IDLE, data: {} };
    setSession(from, session);
  }

  if (incoming.media && session.step !== STEPS.CREATIVE) {
    await reply(
      from,
      'To upload a creative, start *Create New Ad* first — you\'ll be asked to send files during the flow.'
    );
    return;
  }

  await continueFlow(from, session, incoming);
}

async function showEntryForNewUser(to) {
  const next = await showWelcomeAuth(to);
  setSession(to, { step: STEPS.AUTH_GATE, data: next.data });
}

module.exports = {
  handleIncomingMessage,
  showMainMenu,
  showEntryForNewUser,
  STEPS,
};
