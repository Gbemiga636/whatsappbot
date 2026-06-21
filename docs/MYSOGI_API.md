# Connecting Mysogi Website API

The WhatsApp bot can mirror **mysogi.com.ng** when the official API is connected.

## What works without API (today)

- Login / Sign up buttons → open `mysogi.com.ng/login` and `/register` in the browser
- Create campaigns in WhatsApp (saved locally in `data/campaigns.json`)
- Billboard catalog from `src/data/billboards.js` (matches public site LED pricing)
- Links to dashboard after submit

## What needs the API (full site parity)

| Feature | API |
|--------|-----|
| Live billboard list (static + LED) | `GET /billboards` |
| Create campaign on dashboard | `POST /campaigns` |
| User's existing campaigns | `GET /campaigns` (user JWT) |
| Payments & wallet | Mysogi billing endpoints |
| Account link WhatsApp ↔ user | Custom endpoint from Mysogi team |

## Setup

1. Email **info@mysogi.com.ng** and request:
   - WhatsApp integration API access
   - Service API key **or** documentation for user login JWT
   - Webhook to link `wa` query param on login/register to user accounts

2. Add to `.env`:

```env
MYSOGI_API_BASE_URL=https://api.mysogi.com.ng
MYSOGI_API_KEY=your_jwt_or_service_token
```

3. Restart: `npm start`

## Website deep links

All links include `?ref=whatsapp&wa=YOUR_PHONE` so Mysogi can auto-link accounts when their backend supports it.

| Action | URL |
|--------|-----|
| Login | `/login` |
| Sign up | `/register` |
| Create campaign | `/create-campaign` |
| Dashboard | `/login` |

## For Mysogi developers

Recommended endpoints:

- `POST /auth/whatsapp/link` — `{ phone, email }`
- `GET /billboards?type=led|static|all`
- `POST /campaigns` — accept `source: "whatsapp"`
