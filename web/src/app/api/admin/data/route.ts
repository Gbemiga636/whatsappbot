import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  fetchClubKonnectBalance,
  fetchOverview,
  fetchReminders,
  fetchSessions,
  fetchTransactions,
  fetchUsers,
} from "@/lib/admin/data";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const resource = searchParams.get("resource") || "overview";

  switch (resource) {
    case "overview":
      return NextResponse.json({ ok: true, data: await fetchOverview() });
    case "users":
      return NextResponse.json({ ok: true, data: await fetchUsers() });
    case "transactions":
      return NextResponse.json({ ok: true, data: await fetchTransactions() });
    case "reminders":
      return NextResponse.json({ ok: true, data: await fetchReminders() });
    case "sessions":
      return NextResponse.json({ ok: true, data: await fetchSessions() });
    case "float":
      return NextResponse.json({ ok: true, data: await fetchClubKonnectBalance() });
    default:
      return NextResponse.json({ ok: false, message: "Unknown resource" }, { status: 400 });
  }
}
