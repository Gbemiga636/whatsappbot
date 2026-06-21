# Login & Sign Up Inside WhatsApp (No Browser)

Mysogi uses **WhatsApp Flows** — native full-screen forms inside WhatsApp with **masked password fields**. Passwords never appear in chat.

## One-time setup

### 1. Get WhatsApp Business Account ID

Meta → your app → **WhatsApp** → **API Setup** → copy **WhatsApp Business Account ID**

Add to `.env`:
```env
WHATSAPP_BUSINESS_ACCOUNT_ID=your_waba_id_here
```

### 2. Publish flows (automatic)

```powershell
npm run setup-flows
```

This uploads `flows/mysogi-login.json` and `flows/mysogi-signup.json` to Meta and saves IDs to `data/whatsapp-flows.json`.

### 3. Or manual upload in Meta

1. developers.facebook.com → WhatsApp → **Flows**
2. Create → upload `flows/mysogi-login.json` → **Publish** → copy Flow ID
3. Repeat for `flows/mysogi-signup.json`
4. Add to `.env`:
```env
WHATSAPP_FLOW_LOGIN_ID=...
WHATSAPP_FLOW_SIGNUP_ID=...
```

### 4. Restart bot

```powershell
npm start
```

Console should show: `WhatsApp Flows ready — login=... signup=...`

## User experience

```
Welcome message
  → [Login] button      → in-WhatsApp form (email + masked password)
  → [Sign up] button    → in-WhatsApp form (name, email, password, type)
  → Continue as guest
  → ✅ You are logged in! → Main menu → Create New Ad
```

## Mysogi API

- Login: `POST /api/auth/login` `{ username, password }`
- Register: `POST /api/auth/register` `{ firstName, lastName, email, password, phone, userType }`

`userType`: `individual` or `business`
