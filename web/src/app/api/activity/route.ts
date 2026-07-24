import { NextResponse } from "next/server";
import { getActivityForPhone } from "@/lib/user/auth-service";
import { getUserSession } from "@/lib/user/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getUserSession();
  if (!session) {
    return NextResponse.json({ ok: false, rows: [] }, { status: 401 });
  }

  const data = await getActivityForPhone(session.phone, 50);
  return NextResponse.json({ ok: true, ...data });
}
