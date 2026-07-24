import Link from "next/link";
import {
  faUsers,
  faReceipt,
  faCreditCard,
  faComments,
  faBell,
  faWallet,
  faTriangleExclamation,
  faCircleCheck,
  faUserCheck,
  faUserClock,
  faArrowRight,
  faPenToSquare,
  faWaveSquare,
  faBolt,
} from "@fortawesome/free-solid-svg-icons";
import { fetchOverview, fetchTransactions, fetchSessions, fetchUsers } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import { MetricBox, QuickAction, SectionCard } from "@/components/admin/ui";
import { FaIcon } from "@/components/shared/fa-icon";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin overview · Bygate" };

export default async function AdminOverviewPage() {
  const [stats, tx, sessions, users] = await Promise.all([
    fetchOverview(),
    fetchTransactions(8),
    fetchSessions(6),
    fetchUsers(5),
  ]);

  const inflow = stats.paystackIn + stats.opayIn;
  const completionRate =
    stats.txTotal > 0 ? Math.round((stats.txCompleted / stats.txTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
            Operations desk
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Money, users, WhatsApp sessions — one place to run Bygate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              stats.source === "live"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                stats.source === "live" ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {stats.source === "live" ? "Live Supabase" : "Demo mode"}
          </span>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-600/25"
          >
            <FaIcon icon={faPenToSquare} className="h-3.5 w-3.5" />
            Edit wallets
          </Link>
        </div>
      </div>

      {/* Money hero strip — 3 big boxes */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1a0b2e] via-[#3b1d6e] to-[#7c3aed] p-6 text-white shadow-2xl shadow-violet-900/25 lg:col-span-1">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl"
          />
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-200/80">
            Customer wallet float
          </p>
          <p className="mt-3 text-4xl font-extrabold tracking-tight">{money(stats.walletFloat)}</p>
          <p className="mt-2 text-sm text-violet-100/75">Liability across all user wallets</p>
          <Link
            href="/admin/users"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-white/90 hover:text-white"
          >
            Manage balances
            <FaIcon icon={faArrowRight} className="h-3 w-3" />
          </Link>
        </section>

        <section className="rounded-[28px] border border-white bg-white p-6 shadow-sm shadow-violet-900/5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                Payment inflow
              </p>
              <p className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 tabular-nums">
                {money(inflow)}
              </p>
              <p className="mt-2 text-xs text-gray-500">Paystack + OPay completed</p>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <FaIcon icon={faCreditCard} className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-[#F8F6FC] px-3 py-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Paystack</p>
              <p className="mt-1 text-sm font-extrabold text-gray-900">{money(stats.paystackIn)}</p>
            </div>
            <div className="rounded-2xl bg-[#F8F6FC] px-3 py-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">OPay</p>
              <p className="mt-1 text-sm font-extrabold text-gray-900">{money(stats.opayIn)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white bg-white p-6 shadow-sm shadow-violet-900/5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                Transaction health
              </p>
              <p className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 tabular-nums">
                {completionRate}%
              </p>
              <p className="mt-2 text-xs text-gray-500">
                {stats.txCompleted.toLocaleString()} of {stats.txTotal.toLocaleString()} completed
              </p>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <FaIcon icon={faCircleCheck} className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link
              href="/admin/transactions"
              className="rounded-2xl bg-orange-50 px-3 py-3 transition hover:bg-orange-100"
            >
              <p className="text-[10px] font-bold uppercase text-orange-700">Pending</p>
              <p className="mt-1 text-lg font-extrabold text-orange-900">{stats.txPending}</p>
            </Link>
            <Link
              href="/admin/transactions"
              className="rounded-2xl bg-rose-50 px-3 py-3 transition hover:bg-rose-100"
            >
              <p className="text-[10px] font-bold uppercase text-rose-700">Failed</p>
              <p className="mt-1 text-lg font-extrabold text-rose-900">{stats.txFailed}</p>
            </Link>
          </div>
        </section>
      </div>

      {/* Attention banners */}
      {(stats.txPending > 0 || stats.txFailed > 0 || stats.remindersDueSoon > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.txPending > 0 ? (
            <Link
              href="/admin/transactions"
              className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3"
            >
              <FaIcon icon={faTriangleExclamation} className="h-4 w-4 text-orange-600" />
              <div>
                <p className="text-sm font-bold text-orange-900">{stats.txPending} pending payments</p>
                <p className="text-xs text-orange-700">Review checkout queue</p>
              </div>
            </Link>
          ) : null}
          {stats.txFailed > 0 ? (
            <Link
              href="/admin/transactions"
              className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3"
            >
              <FaIcon icon={faTriangleExclamation} className="h-4 w-4 text-rose-600" />
              <div>
                <p className="text-sm font-bold text-rose-900">{stats.txFailed} failed txs</p>
                <p className="text-xs text-rose-700">Needs investigation</p>
              </div>
            </Link>
          ) : null}
          {stats.remindersDueSoon > 0 ? (
            <Link
              href="/admin/reminders"
              className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3"
            >
              <FaIcon icon={faBell} className="h-4 w-4 text-amber-600" />
              <div>
                <p className="text-sm font-bold text-amber-900">
                  {stats.remindersDueSoon} reminders due soon
                </p>
                <p className="text-xs text-amber-700">WhatsApp alerts firing</p>
              </div>
            </Link>
          ) : null}
        </div>
      )}

      {/* Metric grids by function */}
      <SectionCard title="Users" description="Accounts linked to WhatsApp numbers">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricBox
            label="Total users"
            value={String(stats.usersTotal)}
            hint="WhatsApp + web"
            icon={faUsers}
            tone="violet"
            href="/admin/users"
          />
          <MetricBox
            label="Authenticated"
            value={String(stats.usersAuth)}
            hint="Full accounts"
            icon={faUserCheck}
            tone="emerald"
            href="/admin/users"
          />
          <MetricBox
            label="Guests"
            value={String(stats.usersGuest)}
            hint="Pay at checkout"
            icon={faUserClock}
            tone="amber"
            href="/admin/users"
          />
          <MetricBox
            label="Wallet float"
            value={money(stats.walletFloat)}
            hint="Sum of balances"
            icon={faWallet}
            tone="fuchsia"
            href="/admin/users"
          />
        </div>
      </SectionCard>

      <SectionCard title="Payments & ledger" description="Cash in and fulfillment status">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricBox
            label="All transactions"
            value={stats.txTotal.toLocaleString()}
            hint={`${stats.txCompleted.toLocaleString()} done`}
            icon={faReceipt}
            tone="sky"
            href="/admin/transactions"
          />
          <MetricBox
            label="Paystack"
            value={money(stats.paystackIn)}
            hint="Completed inflow"
            icon={faCreditCard}
            tone="violet"
            href="/admin/payments"
          />
          <MetricBox
            label="OPay"
            value={money(stats.opayIn)}
            hint="Direct checkout"
            icon={faCreditCard}
            tone="fuchsia"
            href="/admin/payments"
          />
          <MetricBox
            label="Provider float"
            value="Open"
            hint="ClubKonnect balance"
            icon={faBolt}
            tone="orange"
            href="/admin/float"
          />
        </div>
      </SectionCard>

      <SectionCard title="WhatsApp ops" description="Live bot activity and alerts">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricBox
            label="Live sessions"
            value={String(stats.liveSessions)}
            hint="Active right now"
            icon={faComments}
            tone="amber"
            href="/admin/sessions"
          />
          <MetricBox
            label="Reminders on"
            value={String(stats.remindersActive)}
            hint={`${stats.remindersDueSoon} due soon`}
            icon={faBell}
            tone="rose"
            href="/admin/reminders"
          />
          <MetricBox
            label="Pending"
            value={String(stats.txPending)}
            hint="Awaiting payment"
            icon={faTriangleExclamation}
            tone="orange"
            href="/admin/transactions"
          />
          <MetricBox
            label="Failed"
            value={String(stats.txFailed)}
            hint="Needs review"
            icon={faTriangleExclamation}
            tone="rose"
            href="/admin/transactions"
          />
        </div>
      </SectionCard>

      {/* Quick actions — all tools */}
      <SectionCard title="Quick actions" description="Jump into the most common jobs">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction
            href="/admin/users"
            label="Edit user wallets"
            hint="Set or adjust balances"
            icon={faPenToSquare}
            tone="bg-violet-100 text-violet-700"
          />
          <QuickAction
            href="/admin/transactions"
            label="Transaction ledger"
            hint="Airtime, bills, top-ups"
            icon={faReceipt}
            tone="bg-sky-100 text-sky-700"
          />
          <QuickAction
            href="/admin/payments"
            label="Paystack & OPay"
            hint="Cash-in rails"
            icon={faCreditCard}
            tone="bg-fuchsia-100 text-fuchsia-700"
          />
          <QuickAction
            href="/admin/float"
            label="ClubKonnect float"
            hint="VTU provider wallet"
            icon={faWallet}
            tone="bg-orange-100 text-orange-700"
          />
          <QuickAction
            href="/admin/sessions"
            label="Live WhatsApp"
            hint="Who is in which step"
            icon={faComments}
            tone="bg-amber-100 text-amber-700"
          />
          <QuickAction
            href="/admin/reminders"
            label="Reminders"
            hint="Scheduled alerts"
            icon={faBell}
            tone="bg-rose-100 text-rose-700"
          />
          <QuickAction
            href="/admin/activity"
            label="Activity feed"
            hint="Combined timeline"
            icon={faWaveSquare}
            tone="bg-slate-100 text-slate-700"
          />
          <QuickAction
            href="/admin/users"
            label="Find a user"
            hint="Search by phone or name"
            icon={faUsers}
            tone="bg-emerald-100 text-emerald-700"
          />
        </div>
      </SectionCard>

      {/* Live panels */}
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Latest transactions"
          description="Newest first"
          action={
            <Link href="/admin/transactions" className="text-sm font-bold text-violet-700">
              View all
            </Link>
          }
        >
          <div className="space-y-2">
            {tx.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No transactions yet</p>
            ) : (
              tx.rows.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-[#F8F6FC] px-4 py-3"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm">
                    <FaIcon icon={faReceipt} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {t.service} · {t.type}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {t.phone} · {new Date(t.createdAt).toLocaleString("en-NG")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold tabular-nums text-gray-900">
                      {money(t.amount)}
                    </p>
                    <Badge
                      variant={
                        t.status === "completed"
                          ? "success"
                          : t.status === "pending"
                            ? "warning"
                            : "outline"
                      }
                      className="mt-1"
                    >
                      {t.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Live WhatsApp"
          description="Recent bot sessions"
          action={
            <Link href="/admin/sessions" className="text-sm font-bold text-violet-700">
              View all
            </Link>
          }
        >
          <div className="space-y-2">
            {sessions.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No live sessions</p>
            ) : (
              sessions.rows.map((s) => (
                <div
                  key={s.phone}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-[#F8F6FC] px-4 py-3"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
                    <FaIcon icon={faComments} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{s.phone}</p>
                    <p className="truncate text-xs text-gray-500">
                      {s.activeService || "menu"} · step {s.step}
                    </p>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    {new Date(s.updatedAt).toLocaleTimeString("en-NG", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      {/* Top wallets snapshot */}
      <SectionCard
        title="Wallet snapshot"
        description="Highest balances (sample)"
        action={
          <Link href="/admin/users" className="text-sm font-bold text-violet-700">
            Edit any balance
          </Link>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[...users.rows]
            .sort((a, b) => b.walletBalance - a.walletBalance)
            .slice(0, 5)
            .map((u) => {
              const name =
                [u.firstName, u.lastName].filter(Boolean).join(" ") || "User";
              return (
                <div
                  key={u.id || u.phone}
                  className="rounded-2xl border border-gray-100 bg-[#F8F6FC] p-4"
                >
                  <p className="truncate text-sm font-bold text-gray-900">{name}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-gray-500">{u.phone}</p>
                  <p className="mt-3 text-lg font-extrabold text-violet-700">
                    {money(u.walletBalance)}
                  </p>
                  <Badge
                    variant={u.authMode === "authenticated" ? "success" : "warning"}
                    className="mt-2"
                  >
                    {u.authMode}
                  </Badge>
                </div>
              );
            })}
          {!users.rows.length ? (
            <p className="col-span-full py-6 text-center text-sm text-gray-500">No users yet</p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
