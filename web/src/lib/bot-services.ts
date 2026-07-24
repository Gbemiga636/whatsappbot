import { whatsappLink } from "@/lib/constants";

export type ServiceAction = {
  id: string;
  label: string;
  hint: string;
  message: string;
  group: "vtu" | "bills" | "account" | "more";
  icon:
    | "mobile"
    | "bolt"
    | "users"
    | "bell"
    | "plug"
    | "tv"
    | "gamepad"
    | "wallet"
    | "plus"
    | "comments"
    | "robot";
};

/** Mirrors WhatsApp super-app menu — opens bot with the same intents. */
export const BOT_SERVICES: ServiceAction[] = [
  {
    id: "airtime",
    label: "Airtime",
    hint: "MTN · Glo · Airtel · 9mobile",
    message: "I want to buy airtime",
    group: "vtu",
    icon: "mobile",
  },
  {
    id: "data",
    label: "Data",
    hint: "Bundles for any network",
    message: "I want to buy data",
    group: "vtu",
    icon: "bolt",
  },
  {
    id: "bulk",
    label: "Bulk airtime",
    hint: "Send to many numbers",
    message: "I want bulk airtime",
    group: "vtu",
    icon: "users",
  },
  {
    id: "electric",
    label: "Electricity",
    hint: "IKEDC · EKEDC · more",
    message: "I want to pay electricity",
    group: "bills",
    icon: "plug",
  },
  {
    id: "tv",
    label: "TV",
    hint: "DStv · GOtv · StarTimes",
    message: "I want to pay TV subscription",
    group: "bills",
    icon: "tv",
  },
  {
    id: "betting",
    label: "Betting",
    hint: "Fund betting wallets",
    message: "I want to fund betting",
    group: "bills",
    icon: "gamepad",
  },
  {
    id: "contacts",
    label: "Contacts",
    hint: "Saved people for reorders",
    message: "Show my saved contacts",
    group: "account",
    icon: "users",
  },
  {
    id: "reminders",
    label: "Reminders",
    hint: "WhatsApp alerts",
    message: "Remind me to drink water every day at 8am",
    group: "account",
    icon: "bell",
  },
  {
    id: "wallet",
    label: "My wallet",
    hint: "Check balance",
    message: "Show my wallet balance",
    group: "account",
    icon: "wallet",
  },
  {
    id: "topup",
    label: "Top up",
    hint: "Paystack or OPay",
    message: "I want to top up my wallet",
    group: "account",
    icon: "plus",
  },
  {
    id: "ai",
    label: "Ask AI",
    hint: "Anything on Bygate",
    message: "Hi Bygate, help me",
    group: "more",
    icon: "robot",
  },
  {
    id: "chat",
    label: "Open chat",
    hint: "Full WhatsApp menu",
    message: "Hi Bygate — open menu",
    group: "more",
    icon: "comments",
  },
];

export function serviceWhatsAppHref(service: ServiceAction, phone?: string) {
  const suffix = phone
    ? ` (my number is ${phone.startsWith("234") ? `0${phone.slice(3)}` : phone})`
    : "";
  return whatsappLink(`${service.message}${suffix}`);
}
