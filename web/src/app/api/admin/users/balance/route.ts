import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { updateUserWallet } from "@/lib/admin/data";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    phone?: string;
    mode?: "set" | "adjust";
    amount?: number;
    reason?: string;
  };

  const mode = body.mode === "adjust" ? "adjust" : "set";
  const result = await updateUserWallet({
    phone: String(body.phone || ""),
    mode,
    amount: Number(body.amount),
    reason: body.reason,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
