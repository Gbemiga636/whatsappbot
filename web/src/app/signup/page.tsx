import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/shared/logo";
import { SignupForm } from "@/components/auth/signup-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Sign up",
  description: "Create a Bygate account or continue as guest.",
};

export default function SignupPage() {
  return (
    <div className="relative min-h-screen bg-[#FAFAFC]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(109,40,217,0.1),transparent)]"
      />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="shadow-lg shadow-violet-900/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Get started</CardTitle>
            <CardDescription>Create an account, continue as guest, or use WhatsApp</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-gray-100" />}>
              <SignupForm />
            </Suspense>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-800">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
