import { fetchReminders } from "@/lib/admin/data";
import { AdminPageHeader, AdminPanel, DataTable } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reminders · Admin" };

export default async function AdminRemindersPage() {
  const { rows, live } = await fetchReminders(300);
  const active = rows.filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reminders"
        description="WhatsApp scheduled alerts across all users."
        live={live}
      />

      <AdminPanel>
        <p className="mb-4 text-sm font-bold text-gray-900">
          {rows.length} reminders · {active} enabled
        </p>
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
            title: <span className="font-semibold text-gray-900">{r.title}</span>,
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
      </AdminPanel>
    </div>
  );
}
