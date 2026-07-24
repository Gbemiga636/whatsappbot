import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/shared/logo";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata = {
  title: "Sign up",
  description: "Create a Bygate account or continue as guest.",
};

export default function SignupPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F3F6F4] px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-teal-300/20 blur-3xl"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="overflow-hidden rounded-[28px] border border-white bg-white shadow-xl shadow-emerald-900/10">
          <div className="bg-gradient-to-br from-[#0B1F17] via-[#0F3D2E] to-[#1A9B6C] px-6 py-6 text-white">
            <h1 className="text-2xl font-extrabold tracking-tight">Get started</h1>
            <p className="mt-1 text-sm text-emerald-100/80">
              Create an account, continue as guest, or use WhatsApp
            </p>
          </div>
          <div className="px-6 py-6">
            <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-gray-100" />}>
              <SignupForm />
            </Suspense>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">
          <Link href="/" className="font-semibold text-emerald-700 hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
