import { NextResponse } from "next/server";
import {
  clearAdminSessionCookie,
  setAdminSessionCookie,
  verifyAdminCredentials,
} from "@/lib/admin/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    action?: string;
  };

  if (body.action === "logout") {
    await clearAdminSessionCookie();
    return NextResponse.json({ ok: true });
  }

  const email = String(body.email || "");
  const password = String(body.password || "");
  if (!verifyAdminCredentials(email, password)) {
    return NextResponse.json({ ok: false, message: "Invalid email or password" }, { status: 401 });
  }

  await setAdminSessionCookie(email);
  return NextResponse.json({ ok: true });
}
