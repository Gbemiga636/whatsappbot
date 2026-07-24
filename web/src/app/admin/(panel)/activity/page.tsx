import {
  faWaveSquare,
  faReceipt,
  faComments,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { fetchSessions, fetchTransactions, fetchUsers } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import { AdminPageHeader, MetricBox, SectionCard } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { FaIcon } from "@/components/shared/fa-icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity · Admin" };

export default async function AdminActivityPage() {
  const [users, txs, sessions] = await Promise.all([
    fetchUsers(30),
    fetchTransactions(40),
    fetchSessions(30),
  ]);

  const events = [
    ...txs.rows.map((t) => ({
      at: t.createdAt,
      kind: "transaction" as const,
      title: `${t.service} · ${t.type}`,
      detail: `${t.phone} · ${money(t.amount)} · ${t.status}`,
      provider: t.provider,
    })),
    ...sessions.rows.map((s) => ({
      at: s.updatedAt,
      kind: "session" as const,
      title: `WhatsApp · ${s.activeService || "menu"}`,
      detail: `${s.phone} · step ${s.step}`,
      provider: null as string | null,
    })),
    ...users.rows.map((u) => ({
      at: u.updatedAt,
      kind: "user" as const,
      title: `User · ${u.authMode}`,
      detail: `${u.phone} · wallet ${money(u.walletBalance)}`,
      provider: null as string | null,
    })),
  ]
    .filter((e) => e.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 60);

  const live = users.live || txs.live || sessions.live;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Activity feed"
        description="Combined stream of transactions, WhatsApp sessions, and user updates."
        live={live}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricBox
          label="Events shown"
          value={String(events.length)}
          hint="Mixed timeline"
          icon={faWaveSquare}
          tone="slate"
        />
        <MetricBox
          label="From txs"
          value={String(txs.rows.length)}
          hint="Recent ledger"
          icon={faReceipt}
          tone="sky"
          href="/admin/transactions"
        />
        <MetricBox
          label="From sessions"
          value={String(sessions.rows.length)}
          hint="WhatsApp activity"
          icon={faComments}
          tone="amber"
          href="/admin/sessions"
        />
      </div>

      <SectionCard title="Latest events" description="Web + WhatsApp in one timeline">
        <div className="space-y-2">
          {events.map((e, i) => (
            <div
              key={`${e.kind}-${e.at}-${i}`}
              className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-[#F8F6FC] px-4 py-3.5"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-violet-700 shadow-sm">
                <FaIcon
                  icon={
                    e.kind === "transaction"
                      ? faReceipt
                      : e.kind === "session"
                        ? faComments
                        : faUsers
                  }
                  className="h-3.5 w-3.5"
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      e.kind === "transaction"
                        ? "default"
                        : e.kind === "session"
                          ? "success"
                          : "outline"
                    }
                  >
                    {e.kind}
                  </Badge>
                  <p className="text-sm font-semibold text-gray-900">{e.title}</p>
                </div>
                <p className="mt-1 truncate text-xs text-gray-500">{e.detail}</p>
              </div>
              <div className="text-right text-xs text-gray-400">
                <p>{new Date(e.at).toLocaleString("en-NG")}</p>
                {e.provider ? <p className="mt-0.5">{e.provider}</p> : null}
              </div>
            </div>
          ))}
          {!events.length ? (
            <p className="py-8 text-center text-sm text-gray-500">No activity yet</p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
