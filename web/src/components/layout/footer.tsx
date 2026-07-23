"use client";

import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { BRAND, whatsappLink } from "@/lib/constants";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: whatsappLink(), label: "WhatsApp bot", external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/#faq", label: "FAQ" },
      { href: `mailto:${BRAND.supportEmail}`, label: "Contact" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/signup", label: "Sign up" },
      { href: "/login", label: "Log in" },
      { href: "/signup?mode=guest", label: "Continue as guest" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-[#FAFAFC]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-gray-500">
              {BRAND.description}
            </p>
            <form
              className="mt-6 flex max-w-md gap-2"
              onSubmit={(e) => e.preventDefault()}
              aria-label="Newsletter"
            >
              <input
                type="email"
                required
                placeholder="Email for product updates"
                className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-3.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600/30"
              />
              <button
                type="submit"
                className="h-11 rounded-xl bg-violet-700 px-4 text-sm font-medium text-white hover:bg-violet-800"
              >
                Subscribe
              </button>
            </form>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-gray-900">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      {...("external" in link && link.external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="text-sm text-gray-500 transition hover:text-gray-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-gray-200 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </p>
          <p className="text-xs text-gray-400">Built for Nigeria · Paystack secured</p>
        </div>
      </div>
    </footer>
  );
}
