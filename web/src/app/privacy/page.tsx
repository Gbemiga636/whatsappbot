import { AnnouncementBar, Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { BRAND } from "@/lib/constants";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Privacy Policy</h1>
        <p className="mt-4 text-sm text-gray-500">Last updated: July 2026</p>
        <div className="prose prose-gray mt-8 space-y-4 text-sm leading-relaxed text-gray-600">
          <p>
            {BRAND.name} (“we”) provides WhatsApp and web services for payments and utilities in
            Nigeria. We collect account details, phone numbers linked to WhatsApp, and transaction
            metadata needed to fulfill your requests.
          </p>
          <p>
            Payments are processed by Paystack. We do not store full card numbers. Wallet balances
            and transaction history are stored securely in our database providers.
          </p>
          <p>
            Contact{" "}
            <a className="text-violet-700 hover:underline" href={`mailto:${BRAND.supportEmail}`}>
              {BRAND.supportEmail}
            </a>{" "}
            for privacy requests.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
