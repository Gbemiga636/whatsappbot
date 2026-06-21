# API Requirements — Mysogi Super App

Complete list of third-party APIs needed for full production. Services work in **demo mode** without keys; add keys to `.env` to go live.

---

## Core (Required)

### 1. Meta WhatsApp Cloud API
- **Purpose**: Send/receive messages, buttons, lists, media, flows
- **Sign up**: [developers.facebook.com](https://developers.facebook.com)
- **Env**: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`
- **Cost**: Free tier → paid per conversation

### 2. Supabase
- **Purpose**: PostgreSQL database, auth, real-time, storage
- **Sign up**: [supabase.com](https://supabase.com)
- **Env**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- **Setup**: Run `supabase/migrations/001_initial_schema.sql` in SQL Editor
- **Cost**: Free tier → $25/mo Pro

### 3. OpenAI
- **Purpose**: AI assistant, ad copy, tutoring, agricultural advisory
- **Sign up**: [platform.openai.com](https://platform.openai.com)
- **Env**: `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini`
- **Cost**: ~$0.15/1M input tokens (gpt-4o-mini)

---

## Payments & Banking

### 4. Paystack ⭐ Recommended for Nigeria
- **Purpose**: Card payments, bank transfers, virtual accounts, subaccounts
- **Website**: [paystack.com](https://paystack.com)
- **Env**: `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`
- **Used by**: Banking transfers, payment collection, wallet top-up
- **Docs**: [paystack.com/docs/api](https://paystack.com/docs/api)

### 5. Flutterwave (Alternative)
- **Purpose**: Pan-African payments, transfers, virtual cards
- **Website**: [flutterwave.com](https://flutterwave.com)
- **Env**: `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_PUBLIC_KEY`

### 6. Mono (Banking / Open Banking)
- **Purpose**: Account linking, balance, transaction history, BVN verify
- **Website**: [mono.co](https://mono.co)
- **Env**: `MONO_SECRET_KEY`
- **Used by**: Banking module — real account data

### 7. Anchor (Banking-as-a-Service)
- **Purpose**: Virtual accounts, sub-accounts, full banking API
- **Website**: [getanchor.co](https://getanchor.co)
- **Env**: `ANCHOR_API_KEY`

---

## Bills, Airtime & Utilities

### 8. VTPass ⭐ Recommended
- **Purpose**: Airtime, data, electricity (IKEDC, EKEDC, etc.), DStv, GOtv, StarTimes
- **Website**: [vtpass.com](https://vtpass.com)
- **Env**: `VTPASS_API_KEY`, `VTPASS_PUBLIC_KEY`, `VTPASS_SANDBOX=true`
- **Docs**: [vtpass.com/documentation](https://www.vtpass.com/documentation)

### 9. Budpay (Alternative airtime)
- **Purpose**: Airtime, data, bills
- **Website**: [budpay.com](https://budpay.com)

---

## Food & Delivery

### 10. Chowdeck
- **Purpose**: Restaurant listings, menus, order dispatch
- **Website**: [chowdeck.com](https://chowdeck.com) (partnership required)
- **Env**: `CHOWDECK_API_KEY`

### 11. Gokada / Bolt / Uber
- **Purpose**: Ride hailing, food delivery logistics
- **Note**: Requires partnership; use internal dispatch until partnered

---

## Loans & Credit

### 12. Carbon API
- **Purpose**: Loan origination, credit scoring referral
- **Website**: [carbon.africa](https://carbon.africa)

### 13. FairMoney / PalmCredit
- **Purpose**: Loan marketplace partners (referral APIs)
- **Note**: Contact partnerships team for API access

### 14. Credit Bureau (CRC / FirstCentral)
- **Purpose**: BVN verification, credit reports
- **Required for**: Loan matching with real credit data

---

## Travel

### 15. Wakanow / Travelstart
- **Purpose**: Flight & hotel booking
- **Env**: `WAKANOW_API_KEY`
- **Alternative**: Amadeus API (global flights)

### 16. Amadeus Self-Service API
- **Purpose**: Flight search, booking, hotels
- **Website**: [developers.amadeus.com](https://developers.amadeus.com)

---

## Healthcare

### 17. RelianceHMO / Avon HMO
- **Purpose**: Doctor consultations, health plans
- **Note**: Partnership required

### 18. HealthPlus / Medplus API
- **Purpose**: Pharmacy inventory, medicine delivery
- **Note**: Build custom integration or use internal catalog

---

## Education

### 19. WAEC / JAMB (Government)
- **Purpose**: Results verification, registration
- **Note**: Official APIs limited; use web scraping or manual verification initially

---

## Mysogi Platform (Your Existing API)

### 20. Mysogi API
- **Purpose**: Ads campaigns, billboards, wallet, user accounts
- **Env**: `MYSOGI_API_BASE_URL`, `MYSOGI_API_KEY`
- **Docs**: `docs/MYSOGI_API.md`

---

## Email (Auth OTP)

### 21. SMTP / SendGrid / Resend
- **Purpose**: Email OTP for login
- **Env**: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- **Alternative**: Resend (`resend.com`) — simpler API

---

## Recommended Rollout Order

| Phase | APIs | Services live |
|-------|------|---------------|
| **1 — MVP** | WhatsApp + Supabase + OpenAI | Menu, AI, demo flows |
| **2 — Payments** | Paystack + VTPass | Airtime, bills, transfers |
| **3 — Commerce** | Chowdeck + Paystack | Food, shopping, marketplace |
| **4 — Finance** | Mono + loan partners | Banking, loans, BNPL |
| **5 — Scale** | Travel, healthcare, gov | Full super app |

---

## Monthly Cost Estimate (10K users)

| Service | Est. cost |
|---------|-----------|
| Supabase Pro | $25 |
| OpenAI | $50–200 |
| Paystack | 1.5% per transaction |
| VTPass | Margin on face value |
| WhatsApp | ~$0.05–0.15 per conversation |
| Server (Railway/Fly.io) | $20–50 |
| **Total base** | **~$100–300/mo** + transaction fees |

---

## Security Checklist

- [ ] Never commit `.env` — use `.env.example` only
- [ ] Use `SUPABASE_SERVICE_ROLE_KEY` only on server, never in client
- [ ] Rotate WhatsApp tokens every 60 days
- [ ] Enable RLS on Supabase when exposing anon key
- [ ] Hash OTPs (already implemented)
- [ ] Validate webhook `phone_number_id` (already implemented)
- [ ] PCI: never store card numbers — use Paystack hosted checkout
