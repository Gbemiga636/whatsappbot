# Mysogi Super App

**Africa's WhatsApp Super App** — banking, bills, food, shopping, loans, travel, healthcare, education, AI assistant, and Ads Studio. All in one WhatsApp conversation.

## Quick Start

```bash
npm install
cp .env.example .env   # Fill in WhatsApp + Supabase keys
npm start
```

Expose webhook (development):

```bash
npm run tunnel
```

Point Meta webhook to: `https://your-tunnel/webhook`

## What Users See

Send **Hi** → Super App menu with 15 services:

| Service | What it does |
|---------|-------------|
| 🏦 Banking | Transfers, balance, history |
| 📱 Airtime & Data | MTN, Glo, Airtel, 9mobile |
| ⚡ Bills & TV | Electricity, DStv, GOtv |
| 🍔 Food Delivery | Order from restaurants |
| 🛒 Shopping | Groceries & e-commerce |
| 💰 Loans | Personal loans & BNPL |
| 🎯 Ads Studio | AI ads & campaigns (original Mysogi) |
| ✈️ Travel | Flights, hotels, rides |
| 🤖 AI Assistant | Personal AI helper |
| 💼 Business Tools | Invoices, CRM, payments |
| 🏥 Healthcare | Doctors, pharmacy, labs |
| 🏪 Marketplace | Buy & sell anything |
| 📚 Education | WAEC/JAMB tutor, school fees |
| 🌾 Agriculture | Farm marketplace & advisory |
| 💼 Jobs | Job search & applications |

Users can also type naturally: *"Buy MTN airtime 500"*, *"Order jollof rice"*, *"Transfer 5000 to John"*.

## Setup

### 1. WhatsApp (required)
Meta Developer Console → WhatsApp → API Setup → copy token & phone number ID.

### 2. Supabase (recommended for production)
See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)

### 3. APIs for live payments
See [docs/API_REQUIREMENTS.md](docs/API_REQUIREMENTS.md)

| Priority | API | Purpose |
|----------|-----|---------|
| ⭐ | Paystack | Payments & transfers |
| ⭐ | VTPass | Airtime, data, bills |
| ⭐ | OpenAI | AI assistant |
| | Mono | Banking open banking |
| | Chowdeck | Food delivery |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

```
WhatsApp → Webhook → Super App Router → Service Modules → API Providers
                              ↓
                         Supabase DB
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start bot |
| `npm run dev` | Watch mode |
| `npm test` | Smoke tests |
| `npm run tunnel` | Cloudflare tunnel |
| `npm run setup-flows` | Upload WhatsApp Flows |

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [API Requirements](docs/API_REQUIREMENTS.md)
- [Supabase Setup](docs/SUPABASE_SETUP.md)
- [Mysogi API](docs/MYSOGI_API.md)

## Health Check

```bash
curl http://localhost:3000/health
```

```json
{
  "ok": true,
  "service": "mysogi-super-app",
  "version": "2.0.0",
  "supabase": true
}
```
