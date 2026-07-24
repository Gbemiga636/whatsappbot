import { NextResponse } from "next/server";
import { loginWithPhone } from "@/lib/user/auth-service";
import { attachUserSessionCookie, clearUserSessionOnResponse } from "@/lib/user/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    phone?: string;
    password?: string;
  };

  if (body.action === "logout") {
    const res = NextResponse.json({ ok: true });
    return clearUserSessionOnResponse(res);
  }

  const result = await loginWithPhone({
    phone: String(body.phone || ""),
    password: String(body.password || ""),
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, user: result.user });
  return attachUserSessionCookie(res, result.user.phone);
}
