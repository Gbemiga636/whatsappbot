import { NextResponse } from "next/server";
import {
  attachAdminSessionCookie,
  clearAdminSessionOnResponse,
  verifyAdminCredentials,
} from "@/lib/admin/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    action?: string;
  };

  if (body.action === "logout") {
    const res = NextResponse.json({ ok: true });
    return clearAdminSessionOnResponse(res);
  }

  const email = String(body.email || "").trim();
  const password = String(body.password || "");

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Admin password is not configured on the server. Add ADMIN_PASSWORD (and ADMIN_EMAIL) in Netlify env vars.",
      },
      { status: 503 }
    );
  }

  if (!verifyAdminCredentials(email, password)) {
    return NextResponse.json({ ok: false, message: "Invalid email or password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, email: email.toLowerCase() });
  await attachAdminSessionCookie(res, email);
  return res;
}
