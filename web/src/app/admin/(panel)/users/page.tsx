import { fetchUsers } from "@/lib/admin/data";
import { AdminPageHeader, AdminPanel } from "@/components/admin/ui";
import { UsersWalletTable } from "@/components/admin/users-wallet-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users · Admin" };

export default async function AdminUsersPage() {
  const { rows, live } = await fetchUsers(200);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Users & wallets"
        description="Search users and edit wallet balances instantly."
        live={live}
      />

      <AdminPanel>
        <UsersWalletTable rows={rows} />
      </AdminPanel>
    </div>
  );
}
