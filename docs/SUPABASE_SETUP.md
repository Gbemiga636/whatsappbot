# Supabase Setup — Mysogi Super App

## 1. Create Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose region closest to Nigeria (e.g. `eu-west-1` or `af-south-1` if available)
3. Save your database password

## 2. Run Migration

1. Open **SQL Editor** in Supabase dashboard
2. Paste contents of `supabase/migrations/001_initial_schema.sql`
3. Click **Run**

This creates:
- `whatsapp_users` — linked WhatsApp accounts
- `bot_sessions` — conversation state
- `transactions` — all payments
- `orders` — food, grocery, pharmacy
- `campaigns` — ads studio
- `otp_codes` — hashed OTP storage
- `service_logs` — audit trail

## 3. Get API Keys

1. **Settings** → **API**
2. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ server only

## 4. Add to `.env`

```env
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## 5. Auth Integration (Optional — Phase 2)

For full Supabase Auth (email/password, OAuth):

1. **Authentication** → **Providers** → enable Email
2. Create Edge Function for WhatsApp OTP bridge
3. Link `auth.users.id` → `whatsapp_users.supabase_user_id`

Current implementation syncs users to `whatsapp_users` on login via Mysogi OTP — no Supabase Auth UI required for MVP.

## 6. Verify

Restart the bot:

```bash
npm start
```

Check health:

```bash
curl http://localhost:3000/health
```

Should show `"supabase": true`.

## 7. Production Tips

- Enable **Point-in-time Recovery** on Pro plan
- Set up **daily backups**
- Use **Connection pooling** (Supavisor) for high traffic
- Monitor with Supabase **Logs** + **Database** insights

## Fallback Mode

If Supabase is not configured, the bot uses JSON files in `data/`:
- `users.json`, `sessions.json`, `campaigns.json`

This works for development but is **not** suitable for production (no concurrency, no backups).
