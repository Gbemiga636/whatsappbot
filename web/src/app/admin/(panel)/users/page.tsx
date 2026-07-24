import Link from "next/link";
import {
  faUsers,
  faUserCheck,
  faWallet,
  faPenToSquare,
} from "@fortawesome/free-solid-svg-icons";
import { fetchUsers } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import { AdminPageHeader, MetricBox, SectionCard } from "@/components/admin/ui";
import { UsersWalletTable } from "@/components/admin/users-wallet-table";
import { FaIcon } from "@/components/shared/fa-icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users · Admin" };

export default async function AdminUsersPage() {
  const { rows, live } = await fetchUsers(200);
  const auth = rows.filter((u) => u.authMode === "authenticated").length;
  const guests = rows.filter((u) => u.authMode !== "authenticated").length;
  const float = rows.reduce((s, u) => s + (u.walletBalance || 0), 0);
  const withBalance = rows.filter((u) => (u.walletBalance || 0) > 0).length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Users & wallets"
        description="Search anyone and edit their wallet balance instantly."
        live={live}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">
            <FaIcon icon={faPenToSquare} className="h-3 w-3" />
            Balance editor ready
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricBox
          label="Loaded users"
          value={String(rows.length)}
          hint="From WhatsApp store"
          icon={faUsers}
          tone="violet"
        />
        <MetricBox
          label="Authenticated"
          value={String(auth)}
          hint={`${guests} guests`}
          icon={faUserCheck}
          tone="emerald"
        />
        <MetricBox
          label="With balance"
          value={String(withBalance)}
          hint="Non-zero wallets"
          icon={faWallet}
          tone="fuchsia"
        />
        <MetricBox
          label="Float (this page)"
          value={money(float)}
          hint="Sum of loaded rows"
          icon={faWallet}
          tone="amber"
        />
      </div>

      <SectionCard
        title="Wallet editor"
        description="Tap Edit on any row — set an exact balance or adjust by +/−"
        action={
          <Link href="/admin" className="text-sm font-bold text-violet-700">
            Back to overview
          </Link>
        }
      >
        <UsersWalletTable rows={rows} />
      </SectionCard>
    </div>
  );
}
