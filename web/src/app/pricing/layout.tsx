import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Bygate is free to use. Pay only for airtime, data, bills, and wallet top-ups.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
