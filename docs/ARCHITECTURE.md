# Mysogi Super App — Architecture

## Vision

**Africa's WhatsApp Super App** — one conversation, hundreds of services.

Users message the Mysogi bot and access banking, bills, food, shopping, loans, travel, healthcare, education, marketplace, agriculture, jobs, business tools, AI assistant, and Ads Studio — without leaving WhatsApp.

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ |
| Web server | Express |
| WhatsApp | Meta Cloud API (Graph v21) |
| Database & Auth | Supabase (PostgreSQL) |
| AI | OpenAI GPT-4o-mini |
| Payments | Paystack / Flutterwave |
| Bills & Airtime | VTPass |
| Fallback storage | Local JSON (`data/`) |

## Project Structure

```
src/
├── index.js                 # Express entry + webhook
├── config.js                # Environment configuration
├── router/
│   ├── superAppRouter.js    # Central message orchestrator
│   ├── superAppMenu.js      # Main 15-service menu
│   ├── serviceRegistry.js   # Service catalog
│   ├── intentRouter.js      # Natural language → service
│   └── authHandler.js       # Auth from super menu
├── services/                # Pluggable service modules
│   ├── BaseService.js       # Shared service base class
│   ├── banking/
│   ├── airtime/
│   ├── bills/
│   ├── food/
│   ├── shopping/
│   ├── loans/
│   ├── adsStudio/           # Wraps legacy campaign flow
│   ├── travel/
│   ├── business/
│   ├── aiAssistant/
│   ├── healthcare/
│   ├── marketplace/
│   ├── education/
│   ├── agriculture/
│   └── jobs/
├── providers/               # External API adapters
│   ├── paystack.js
│   ├── vtpass.js
│   └── openai.js
├── db/
│   └── supabase.js          # Supabase client
├── auth/
│   └── supabaseAuth.js      # User sync to Supabase
├── stores/                  # Data persistence
│   └── transactionStore.js
├── sessionStore.js          # Conversation state (hybrid)
├── userStore.js             # User profiles (hybrid)
├── flows/                   # Legacy flows (Ads Studio)
│   ├── campaignFlow.js
│   ├── authFlow.js
│   └── billboardFlow.js
└── whatsapp.js              # Meta API client
```

## Message Flow

```
WhatsApp Message
      ↓
POST /webhook
      ↓
webhookFilter (phone_number_id check)
      ↓
superAppRouter
      ├── Auth steps? → authHandler
      ├── Active service? → service.handle()
      ├── Ads Studio? → campaignFlow (legacy)
      ├── Menu selection? → routeToService()
      ├── Natural language? → intentRouter
      └── Default → superAppMenu
```

## Service Module Pattern

Each service extends `BaseService`:

```javascript
class MyService extends BaseService {
  async showMenu(ctx) { /* entry point */ }
  async handle(ctx) { /* conversation logic */ }
}
```

Services are registered in `serviceRegistry.js` and auto-discovered.

## Session Model

```javascript
{
  step: 'banking_menu',       // Current conversation step
  activeService: 'banking',   // Which service owns the conversation
  data: { transfer: {...} },  // Service-specific state
  updatedAt: '...'
}
```

Type `menu` or `home` from anywhere to return to the super app menu.

## Database (Supabase)

Tables: `whatsapp_users`, `bot_sessions`, `transactions`, `orders`, `campaigns`, `otp_codes`, `service_logs`

Migration: `supabase/migrations/001_initial_schema.sql`

Without Supabase, the bot falls back to JSON files in `data/` — fine for dev, not for production.

## Scaling Path

1. **Now**: Single Node process, Supabase, provider adapters
2. **Next**: Redis for session cache, Bull queue for async jobs
3. **Later**: Microservices per domain (payments, delivery, ads)
4. **Enterprise**: Kubernetes, multi-region, WABA sharding

## Environment

See `.env.example` for all variables. Minimum for dev:

- WhatsApp credentials (required)
- Supabase URL + service role key (recommended)
- OPENAI_API_KEY (for full AI)
- PAYSTACK_SECRET_KEY + VTPASS_API_KEY (for live payments)
