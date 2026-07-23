import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin/login-form";

export const metadata = { title: "Admin login · Bygate" };

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F4F5F7]" />}>
      <AdminLoginForm />
    </Suspense>
  );
}
