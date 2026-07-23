import { fetchUsers } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import { DataTable, LiveBadge } from "@/components/admin/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Users · Admin" };

export default async function AdminUsersPage() {
  const { rows, live } = await fetchUsers(200);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            WhatsApp + web accounts (guest and authenticated).
          </p>
        </div>
        <LiveBadge live={live} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} users</CardTitle>
          <CardDescription>Sorted by most recently active</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "name", label: "Name" },
              { key: "phone", label: "Phone" },
              { key: "email", label: "Email" },
              { key: "mode", label: "Mode" },
              { key: "wallet", label: "Wallet", className: "text-right" },
              { key: "updated", label: "Updated" },
            ]}
            rows={rows.map((u) => ({
              name: (
                <span className="font-medium text-gray-900">
                  {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                </span>
              ),
              phone: u.phone,
              email: u.email || "—",
              mode: (
                <Badge variant={u.authMode === "authenticated" ? "success" : "warning"}>
                  {u.authMode}
                </Badge>
              ),
              wallet: <span className="tabular-nums">{money(u.walletBalance)}</span>,
              updated: u.updatedAt ? new Date(u.updatedAt).toLocaleString("en-NG") : "—",
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
