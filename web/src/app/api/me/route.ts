import { NextResponse } from "next/server";
import { getUserByPhone } from "@/lib/user/auth-service";
import { getUserSession } from "@/lib/user/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getUserSession();
  if (!session) {
    return NextResponse.json({ ok: false, user: null }, { status: 401 });
  }

  const user = await getUserByPhone(session.phone);
  if (!user) {
    return NextResponse.json({ ok: false, user: null, message: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, user, live: true });
}
