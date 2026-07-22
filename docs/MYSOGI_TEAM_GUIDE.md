# Bygate WhatsApp Super App — Team Guide

**One document for Admin, Team Lead, BDM, and Executive**

This guide explains how Bygate works on WhatsApp, what each internal role is responsible for, and what to tell customers, partners, and stakeholders.

---

## Table of contents

1. [What Bygate is](#1-what-Bygate-is)
2. [How anyone starts (customers & staff)](#2-how-anyone-starts-customers--staff)
3. [Customer guide — what to share publicly](#3-customer-guide--what-to-share-publicly)
4. [Admin guide — technical & operations](#4-admin-guide--technical--operations)
5. [Team Lead guide — support & daily operations](#5-team-lead-guide--support--daily-operations)
6. [BDM guide — partners & business growth](#6-bdm-guide--partners--business-growth)
7. [Executive guide — strategy & reporting](#7-executive-guide--strategy--reporting)
8. [Quick command cheat sheet](#8-quick-command-cheat-sheet)
9. [Escalation matrix](#9-escalation-matrix)

---

## 1. What Bygate is

Bygate is **Africa’s WhatsApp Super App** — users message the Bygate WhatsApp number and can:

| Category | Live today | Examples |
|----------|------------|----------|
| **VTU & bills** | ✅ | Airtime, data, electricity, TV, betting |
| **Wallet** | ✅ | Top-up, pay from balance, transaction PIN |
| **Guest checkout** | ✅ | Pay via Paystack without creating an account |
| **Saved contacts** | ✅ | “MTN 500 airtime for Mama” |
| **Bulk airtime** | ✅ | Same amount for many numbers |
| **Food** | ✅ | Order via Chowdeck integration |
| **Ads Studio** | ✅ | Billboards, SMS, display, voice ads |
| **Partner marketplace** | ✅ | Businesses list services; users pay via wallet |
| **AI assistant** | ✅ | Ask questions in natural language |
| **Banking, loans, travel, etc.** | 🔜 | Shown as “coming soon” in menu |

**Two ways to use the bot**

1. **Tap the menu** — list buttons for each service  
2. **Type naturally** — e.g. `MTN 500 airtime for Mama`, `fund my SportyBet account`

---

## 2. How anyone starts (customers & staff)

1. Save the **official Bygate WhatsApp business number** (get this from Admin / marketing).
2. Send: **`hi`**, **`hello`**, or **`menu`**
3. Choose one of:
   - **Continue as guest** — browse and pay with Paystack at checkout  
   - **Log in** — existing Bygate account (email + password)  
   - **Sign up** — create account for wallet & history  

**Universal escape words:** `menu`, `hi`, `cancel`, `home`, `0` — return to main menu or exit a flow.

**Staff tip:** Every team member should have a logged-in test account and a guest test number to reproduce customer issues.

---

## 3. Customer guide — what to share publicly

*Copy or adapt this section for social media, onboarding messages, and sales decks.*

### 3.1 Main menu services

| Tap this | What it does |
|----------|--------------|
| 💳 Airtime | Top up MTN, Glo, Airtel, 9mobile |
| 📶 Data | Daily, weekly, monthly bundles |
| 👥 Bulk airtime | Same airtime for many people |
| 📇 Saved contacts | Save names; order by name later |
| ⚡ Electricity | Pay any disco |
| 📺 TV | DStv, GOtv, StarTimes |
| 🎰 Betting | Fund SportyBet, Bet9ja, etc. |
| 🍔 Order Food | Restaurants near you (Chowdeck) |
| 💳 My wallet | Balance, top-up, history *(account required)* |
| ➕ More services | Ads, partners, AI assistant |

### 3.2 Account types

| Mode | Best for | How they pay |
|------|----------|--------------|
| **Guest** | First-time users, one-off purchases | Paystack link at checkout (card, bank, USSD) |
| **Registered** | Repeat users, wallet, PIN | Wallet balance or Paystack top-up |

**Important for guests:** The order is **only fulfilled after Paystack payment succeeds**. They will not receive airtime or data until payment is complete.

### 3.3 Saved contacts

Users **cannot** import their phone’s full contact list (WhatsApp limitation). They save contacts inside Bygate:

```
save contact Mama 08012345678
```

Or **share a contact card** from WhatsApp (📎 → Contact) — the bot asks: airtime, data, or save only.

**Manage contacts anytime:**

| Say this | Action |
|----------|--------|
| `my contacts` | View all saved |
| `edit contact Mama 08099998888` | Update number |
| `delete contact Mama` | Remove |
| `contacts help` | Show format again |

**Order by name:**

```
MTN 500 airtime for Mama
send airtime to Mama
buy data for John
```

### 3.4 Bulk airtime

**Option A — Menu:** Tap **Bulk airtime** → add numbers or names → pick network → amount → confirm  

**Option B — Type:**

```
MTN 100 airtime for 08012345678, 08098765432
airtime for Mama, John and 08011112222
```

### 3.5 Natural language examples

```
MTN 500 airtime
Glo 2GB data for 08012345678
buy MTN 1000 airtime for myself
fund my SportyBet account 5000
IKEDC 5000 for meter 12345678901
top up my wallet 2000
```

### 3.6 Wallet (registered users)

1. Tap **My wallet** → **Top up for me** → enter amount → pay via Paystack  
2. Set a **transaction PIN** (secure web page) before wallet purchases  
3. Buy airtime, bills, food, partner services from wallet balance  

### 3.7 Ads Studio (More services → Ads)

For businesses running campaigns:

- Billboard (LED/static), SMS blast, display ads, voice ads, influencer briefs  
- Requires login; campaigns sync to Bygate platform when API is connected  
- Type `menu` → More services → Ads Studio  

### 3.8 Partner services (More services → Partners)

For **buyers:** Browse listed businesses and pay with wallet.  

For **sellers:** Tap **Add your business** and send:

```
Business name | Category | Description | Service name | Price
```

Example:

```
Ada Beauty | Beauty | Home service salon | Hair styling | 5000
```

---

## 4. Admin guide — technical & operations

**Primary owner:** Platform Admin / DevOps

### 4.1 Your responsibilities

- Keep the bot **online** (hosting, webhooks, env variables)
- Manage **API keys** (WhatsApp, Paystack, Supabase, VTU provider)
- Monitor **transactions** and failed payments
- Deploy updates from GitHub
- Onboard internal staff with test accounts

### 4.2 Infrastructure checklist

| Component | Purpose | Where to configure |
|-----------|---------|-------------------|
| WhatsApp Cloud API | Send/receive messages | Meta Developer Console + `.env` |
| Webhook URL | Incoming messages | `https://YOUR-DOMAIN/webhook` |
| Paystack webhook | Wallet top-up + guest purchases | `https://YOUR-DOMAIN/webhook/paystack` |
| Supabase | Users, sessions, transactions | `docs/SUPABASE_SETUP.md` |
| VTU provider | Airtime, data, bills | ClubKonnect / AutoSyncNG / VTPass in `.env` |
| PUBLIC_BASE_URL | Paystack callbacks | Netlify/Railway domain |

### 4.3 Key environment variables

See `.env.example` for the full list. Minimum for production:

```
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN
PUBLIC_BASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PAYSTACK_SECRET_KEY
BILLS_PROVIDER + provider credentials
```

### 4.4 Health checks

```bash
curl https://YOUR-DOMAIN/health
```

Confirm: `supabase: true`, WhatsApp configured, Paystack configured.

### 4.5 Database tables (Supabase)

| Table | Use |
|-------|-----|
| `whatsapp_users` | Linked accounts, guest flag, saved contacts in metadata |
| `bot_sessions` | Conversation state |
| `transactions` | Wallet top-ups, guest purchases, service payments |
| `wallet_ledger` | Balance movements |
| `business_partners` | Partner listings |
| `campaigns` | Ads Studio |

**Guest purchase flow:** `transactions.type = guest_purchase`, `status = pending` until Paystack webhook → `completed` → airtime/data sent.

### 4.6 Deployment workflow

1. Changes merged to `main` on GitHub (`github.com/Gbemiga636/whatsappbot`)
2. Redeploy hosting (e.g. Netlify) — **required after every push**
3. Smoke test: guest airtime, registered wallet purchase, `hi` → menu

### 4.7 Security rules

- Never commit `.env` or API keys  
- `SUPABASE_SERVICE_ROLE_KEY` — server only  
- Rotate WhatsApp tokens every ~60 days  
- Transaction PIN handled on secure web portal, not in chat  

### 4.8 Admin alerts

Set `ADMIN_WHATSAPP_NUMBER` in `.env` for future alert routing. Monitor Paystack dashboard and Supabase `transactions` for failed `guest_purchase` rows.

---

## 5. Team Lead guide — support & daily operations

**Primary owner:** Customer support / operations lead

### 5.1 Your responsibilities

- First line for **customer complaints** and **stuck orders**
- Train support agents on commands and flows (Section 3 & 8)
- Escalate technical issues to Admin
- Track recurring issues and report to product weekly

### 5.2 Daily checklist

- [ ] Test bot responds to `hi` on production number  
- [ ] Check Paystack for failed/unresolved payments  
- [ ] Review Supabase `transactions` where `status = failed`  
- [ ] Confirm no spike in “Something went wrong” reports  
- [ ] Update team on new features after each deploy  

### 5.3 Common issues & fixes

| Customer says | Likely cause | What to tell them |
|---------------|--------------|-------------------|
| “Airtime not received” | Payment not completed (guest) or VTU delay | Guest: confirm Paystack payment succeeded. Registered: check wallet was debited. Wait 2–5 min. |
| “I paid but nothing happened” | Didn’t return to WhatsApp / webhook delay | Send any message to bot — it checks pending Paystack payments. Share payment reference. |
| “Guest said airtime sent before I paid” | Old bug (fixed) | Redeploy latest version. Guest orders only fulfill **after** Paystack success. |
| “Mama not found” | Contact not saved | `save contact Mama 080…` or share contact card |
| “Stuck in signup” | Typing menu/hi during signup | Say `cancel` or `menu` to exit |
| “Insufficient balance” | Wallet low | Top up via wallet → Paystack link |
| “PIN locked” | Too many wrong PIN attempts | Wait for lockout period; use Change PIN flow |

### 5.4 Information to collect for every ticket

1. Customer WhatsApp number (234…)  
2. Approximate time of issue  
3. Service (airtime, data, bill, food, etc.)  
4. Payment reference (starts with `GST_` for guest, or Paystack ref)  
5. Screenshot of bot messages  

### 5.5 Internal testing protocol

Before telling customers a fix is live:

1. **Guest test:** Airtime → confirm → Paystack → verify airtime arrives **only after** payment  
2. **Registered test:** Wallet top-up → airtime from wallet  
3. **Contacts test:** Save contact → order by name  
4. **Bulk test:** Two numbers → confirm both receive  

---

## 6. BDM guide — partners & business growth

**Primary owner:** Business Development Manager

### 6.1 Your responsibilities

- Onboard **merchants** onto Partner Services  
- Pitch **corporate bulk airtime** to SMEs and agencies  
- Drive **Ads Studio** adoption for brands  
- Explain **guest vs wallet** to prospects who want zero friction  

### 6.2 Elevator pitch

> “Bygate lets your customers buy airtime, data, pay bills, order food, and run ads — all inside WhatsApp. No app download. Guests pay with Paystack; repeat users use a wallet.”

### 6.3 Partner onboarding (merchants)

**Who it’s for:** Salons, tutors, repair services, caterers, any SMB  

**Steps for the merchant:**

1. Message Bygate WhatsApp → Log in or sign up  
2. More services → **Partner Services** → **Add your business**  
3. Send one line: `Business | Category | Description | Service | Price`  
4. Listing goes live; customers pay via Bygate wallet  
5. Merchant gets notified on WhatsApp when orders come in  

**BDM follow-up:** Verify listing quality, help with pricing, promote in your channels.

**Categories available:** Food, Fashion, Beauty, Electronics, Services, Health, Education, Other

### 6.4 Corporate / bulk airtime sales

**Target buyers:** HR, admin teams, churches, event planners, fintech agents  

**Sell these features:**

- **Bulk airtime** — one amount, many numbers  
- **Saved contacts** — “airtime for staff list by name”  
- **Natural language** — `MTN 200 airtime for Team Lead, BDM, Admin`  

**Demo script:**

1. Save 3 contacts with customer names  
2. Run bulk airtime for ₦100 each  
3. Show Paystack receipt and delivery confirmation  

### 6.5 Ads Studio (brand clients)

**Entry:** More services → Ads Studio  

**Ad types:** Billboard, SMS, display, voice, influencer, mini-website, app promotion  

**BDM role:** Qualify budget, collect creative assets, walk client through WhatsApp wizard, hand off to campaigns team for fulfillment on mysogi.com.ng when API-linked.

### 6.6 Objection handling

| Objection | Response |
|-----------|----------|
| “We need an app” | WhatsApp has 90M+ users in Nigeria; zero install friction |
| “Can it read my contacts?” | No — users save names in Bygate or share cards (privacy-friendly) |
| “What about fees?” | Small Bygate service fee shown before payment (typically 2.5%) |
| “Guest vs account?” | Guest = fastest; account = wallet, history, PIN, repeat purchases |

### 6.7 BDM metrics to track

- New partner listings per week  
- Bulk airtime transaction volume  
- Ads Studio campaigns started via WhatsApp  
- Guest → registered conversion rate  

---

## 7. Executive guide — strategy & reporting

**Primary owner:** Leadership / C-suite

### 7.1 Strategic positioning

Bygate is a **conversational commerce layer** on WhatsApp:

- **Acquisition:** Guest checkout removes signup friction  
- **Retention:** Wallet + saved contacts + natural language  
- **Monetization:** VTU margin, service fee, ads, partner commissions  
- **Moat:** One number for airtime, bills, food, ads, and local services  

### 7.2 What’s live vs roadmap

| Live | Roadmap |
|------|---------|
| Airtime, data, bills, betting | Full banking (Mono/Anchor) |
| Wallet + Paystack | Loans & BNPL |
| Guest checkout | Healthcare, education |
| Contacts + bulk airtime | Consumer Chowdeck marketplace (needs partnership API) |
| Food (Chowdeck) | Travel booking |
| Ads Studio + partners | iDeliver as food catalog (logistics only today) |

### 7.3 KPIs for leadership reviews

| KPI | Source |
|-----|--------|
| Daily active users (unique phones) | `whatsapp_users` / message logs |
| Transaction volume (₦) | `transactions` |
| Guest vs wallet split | `transactions.type`, `auth_mode` |
| Success rate | `transactions.status` completed vs failed |
| Top services | `transactions.service` |
| Partner GMV | Partner service transactions |
| Support ticket volume | Team Lead weekly report |

### 7.4 Risk & compliance

- **Payments:** PCI handled by Paystack — no card data in bot  
- **VTU:** Provider SLA drives delivery speed  
- **WhatsApp:** Meta policy compliance for business messaging  
- **Data:** User contacts stored in Supabase metadata — treat as PII  

### 7.5 Executive demo (5 minutes)

1. `hi` → show main menu (contacts + bulk visible)  
2. Guest airtime purchase end-to-end  
3. `save contact Demo 080…` → `MTN 100 airtime for Demo`  
4. Bulk airtime to 2 numbers  
5. More services → Ads or Partners  

---

## 8. Quick command cheat sheet

### Everyone

| Command | Action |
|---------|--------|
| `hi` / `menu` / `hello` | Main menu |
| `cancel` / `home` / `0` | Exit current flow |
| `login` / `signup` | Account |
| `logout` | Sign out |

### Contacts

| Command | Action |
|---------|--------|
| `save contact Name 08012345678` | Save |
| `my contacts` | List all |
| `edit contact Name 080…` | Update |
| `delete contact Name` | Remove |
| `contacts help` | Help text |

### Orders (natural language)

| Example | Action |
|---------|--------|
| `MTN 500 airtime` | Self or prompt for recipient |
| `MTN 500 airtime for Mama` | Named contact |
| `airtime for 080…, 081…` | Bulk |
| `Glo 2GB data` | Data bundle |
| `fund SportyBet 5000` | Betting |
| `top up wallet 2000` | Wallet top-up |

---

## 9. Escalation matrix

| Issue type | First contact | Escalate to | SLA |
|------------|---------------|-------------|-----|
| User can’t complete order | Team Lead | Admin if payment/VTU issue | 4 hours |
| Payment taken, order failed | Team Lead → Admin | Paystack + VTU provider | 2 hours |
| Bot not responding | Admin | Hosting / Meta API | 1 hour |
| Partner listing wrong | BDM | Admin (database) | 24 hours |
| New merchant onboarding | BDM | — | 48 hours |
| Feature request | Team Lead | Product / Executive | Weekly review |
| Security incident | Admin | Executive immediately | Immediate |

---

## Document info

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Last updated | June 2026 |
| Codebase | `whatsappbot` (Bygate WhatsApp Super App) |
| Technical docs | `docs/SUPABASE_SETUP.md`, `docs/API_REQUIREMENTS.md`, `docs/ARCHITECTURE.md` |

**Questions?** Admin → infrastructure. Team Lead → customer issues. BDM → partners & sales. Executive → strategy & KPIs.
