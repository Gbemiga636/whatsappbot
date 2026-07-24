import { NextResponse } from "next/server";
import { signupWithPhone } from "@/lib/user/auth-service";
import { attachUserSessionCookie } from "@/lib/user/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    phone?: string;
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };

  const result = await signupWithPhone({
    phone: String(body.phone || ""),
    email: String(body.email || ""),
    password: String(body.password || ""),
    firstName: String(body.firstName || ""),
    lastName: String(body.lastName || ""),
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, user: result.user });
  return attachUserSessionCookie(res, result.user.phone);
}
