# Bygate website

Marketing site + wallet dashboard for [Bygate](https://bygate.app) — Africa's WhatsApp Super App.

## Run locally

```bash
cd web
cp .env.example .env.local
# Set NEXT_PUBLIC_WHATSAPP_NUMBER to your business number (digits only, e.g. 23480…)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- Landing: hero, stats, features, how it works, testimonials, FAQ, CTA
- Auth: login, signup, continue as guest
- Dashboard: overview charts, wallet top-up UI, activity table, settings
- WhatsApp CTAs everywhere (`wa.me` + prefilled message)
- SEO: metadata, sitemap, robots

## Auth note

Web auth currently uses a secure **local demo session** (localStorage) so the UX is complete. Wire `NEXT_PUBLIC_SUPABASE_*` to the same Supabase project as the WhatsApp bot when you're ready for production accounts.

## Deploy

Deploy the `web/` folder to Vercel (or any Node host). Set env vars from `.env.example`.
