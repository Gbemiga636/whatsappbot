import { fetchReminders } from "@/lib/admin/data";
import { DataTable, LiveBadge } from "@/components/admin/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Reminders · Admin" };

export default async function AdminRemindersPage() {
  const { rows, live } = await fetchReminders(300);
  const active = rows.filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Reminders</h1>
          <p className="mt-1 text-sm text-gray-500">
            WhatsApp scheduled alerts across all users.
          </p>
        </div>
        <LiveBadge live={live} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {rows.length} reminders · {active} enabled
          </CardTitle>
          <CardDescription>Ordered by next fire time</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "title", label: "Title" },
              { key: "phone", label: "Phone" },
              { key: "when", label: "Remind at" },
              { key: "freq", label: "Frequency" },
              { key: "status", label: "Status" },
              { key: "sent", label: "Last sent" },
            ]}
            rows={rows.map((r) => ({
              title: <span className="font-medium text-gray-900">{r.title}</span>,
              phone: r.phone,
              when: new Date(r.remindAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos" }),
              freq: r.frequency,
              status: (
                <Badge variant={r.enabled ? "success" : "outline"}>
                  {r.enabled ? "enabled" : "off"}
                </Badge>
              ),
              sent: r.lastSentAt ? new Date(r.lastSentAt).toLocaleString("en-NG") : "—",
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
