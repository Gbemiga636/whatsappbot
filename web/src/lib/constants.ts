export const BRAND = {
  name: "Bygate",
  tagline: "Africa's WhatsApp Super App",
  description:
    "Airtime, data, bills, wallet, reminders and more — from WhatsApp or the web. Pay with Paystack. Built for Nigeria.",
  supportEmail: "support@bygate.app",
  website: process.env.NEXT_PUBLIC_SITE_URL || "https://bygate.app",
  twitter: "https://twitter.com/bygateapp",
  instagram: "https://instagram.com/bygateapp",
} as const;

/** E.164 without + — override with NEXT_PUBLIC_WHATSAPP_NUMBER */
export const WHATSAPP_NUMBER =
  (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "2348000000000").replace(/\D/g, "");

export function whatsappLink(message?: string) {
  const text = message || "Hi Bygate! I'd like to get started.";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
] as const;

export const FEATURES = [
  {
    id: "airtime",
    title: "Airtime & Data",
    description: "MTN, Glo, Airtel, 9mobile — instant top-ups for you or saved contacts. Bulk send supported.",
    icon: "Smartphone",
  },
  {
    id: "bills",
    title: "Bills & TV",
    description: "Electricity, DStv, GOtv, StarTimes and betting wallets — pay in seconds.",
    icon: "Zap",
  },
  {
    id: "wallet",
    title: "Wallet & Paystack",
    description: "Top up once, spend instantly. Guests pay securely with Paystack at checkout.",
    icon: "Wallet",
  },
  {
    id: "contacts",
    title: "Saved contacts",
    description: "Save Mama once. Say “500 airtime for Mama” — we know the number.",
    icon: "Contact",
  },
  {
    id: "reminders",
    title: "WhatsApp reminders",
    description: "Natural language alerts. “Remind me drink water every day at 8am” — we ping you.",
    icon: "Bell",
  },
  {
    id: "ai",
    title: "AI assistant",
    description: "Ask anything on WhatsApp or the web. Smart routing to the right Bygate action.",
    icon: "Sparkles",
  },
] as const;

/** Static labels kept for SEO / copy — animated UI uses ANIMATED_STATS */
export const STATS = [
  { label: "Transactions processed", value: "2.4M+" },
  { label: "Avg. fulfillment time", value: "<30s" },
  { label: "Networks supported", value: "4" },
  { label: "Uptime target", value: "99.9%" },
] as const;

export const STEPS = [
  {
    step: "01",
    title: "Open WhatsApp or the web",
    description: "Chat with Bygate or sign in here. Continue as guest anytime.",
  },
  {
    step: "02",
    title: "Say what you need",
    description: "Buy airtime, pay a bill, set a reminder — naturally, no menus required.",
  },
  {
    step: "03",
    title: "Pay & done",
    description: "Wallet or Paystack. Confirmation on WhatsApp. Track everything in your dashboard.",
  },
] as const;

export const TESTIMONIALS = [
  {
    quote: "I top up Mama’s line from work without leaving WhatsApp. Feels like magic.",
    name: "Ada Okafor",
    role: "Product designer, Lagos",
  },
  {
    quote: "Guest checkout with Paystack meant I didn’t need an account on day one. Signed up later for the wallet.",
    name: "Tunde Bakare",
    role: "Founder, Abuja",
  },
  {
    quote: "Reminders that actually arrive on WhatsApp. Rent day never sneaks up anymore.",
    name: "Chioma Eze",
    role: "Operations lead, PH",
  },
] as const;

export const FAQS = [
  {
    q: "Do I need an account?",
    a: "No. Continue as guest and pay with Paystack at checkout. Sign up when you want a reusable wallet and history.",
  },
  {
    q: "Is Bygate only on WhatsApp?",
    a: "WhatsApp is our primary surface. This website lets you read features, sign in, check your wallet, and jump into the bot anytime.",
  },
  {
    q: "How do payments work?",
    a: "Logged-in users spend from their Bygate wallet (top up via Paystack). Guests pay per order with Paystack — fulfillment starts after payment confirms.",
  },
  {
    q: "Which networks and bills are supported?",
    a: "MTN, Glo, Airtel, 9mobile for airtime/data. Electricity and major TV subscriptions, plus popular betting wallets.",
  },
  {
    q: "Is my money safe?",
    a: "Payments go through Paystack. Wallet debits happen only after PIN confirmation for signed-in users. We never fulfill guest VTU before payment clears.",
  },
] as const;

export const PRICING = [
  {
    name: "Guest",
    price: "₦0",
    period: "to start",
    description: "Pay per order with Paystack. Perfect to try Bygate.",
    features: ["WhatsApp bot access", "Airtime, data & bills", "Paystack checkout", "Reminders"],
    cta: "Continue as guest",
    href: "/signup?mode=guest",
    highlighted: false,
  },
  {
    name: "Account",
    price: "₦0",
    period: "forever",
    description: "Wallet, history, contacts, and faster reorders.",
    features: [
      "Everything in Guest",
      "Reusable wallet",
      "Saved contacts",
      "Transaction history",
      "Web dashboard",
    ],
    cta: "Create free account",
    href: "/signup",
    highlighted: true,
  },
] as const;
