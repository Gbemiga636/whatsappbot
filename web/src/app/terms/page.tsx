import { AnnouncementBar, Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { BRAND } from "@/lib/constants";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Terms of Service</h1>
        <p className="mt-4 text-sm text-gray-500">Last updated: July 2026</p>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-gray-600">
          <p>
            By using {BRAND.name} on WhatsApp or the web, you agree to use the service lawfully and
            provide accurate information for airtime, data, and bill payments.
          </p>
          <p>
            Guest checkout requires successful Paystack payment before fulfillment. Wallet purchases
            require sufficient balance and PIN confirmation where enabled.
          </p>
          <p>
            Questions? Email{" "}
            <a className="text-violet-700 hover:underline" href={`mailto:${BRAND.supportEmail}`}>
              {BRAND.supportEmail}
            </a>
            .
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
