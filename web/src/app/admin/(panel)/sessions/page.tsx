import { fetchSessions } from "@/lib/admin/data";
import { AdminPageHeader, AdminPanel, DataTable } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live WhatsApp · Admin" };

function ago(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function AdminSessionsPage() {
  const { rows, live } = await fetchSessions(150);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Live WhatsApp"
        description="What each user is doing in the bot right now (session step + service)."
        live={live}
      />

      <AdminPanel>
        <p className="mb-4 text-sm font-bold text-gray-900">{rows.length} sessions</p>
        <DataTable
          columns={[
            { key: "phone", label: "Phone" },
            { key: "service", label: "Service" },
            { key: "step", label: "Step" },
            { key: "when", label: "Last activity" },
          ]}
          rows={rows.map((s) => ({
            phone: <span className="font-semibold text-gray-900">{s.phone}</span>,
            service: s.activeService ? (
              <Badge>{s.activeService}</Badge>
            ) : (
              <Badge variant="outline">idle / menu</Badge>
            ),
            step: <span className="font-mono text-xs">{s.step}</span>,
            when: (
              <span>
                {ago(s.updatedAt)}{" "}
                <span className="text-gray-400">
                  · {new Date(s.updatedAt).toLocaleString("en-NG")}
                </span>
              </span>
            ),
          }))}
        />
      </AdminPanel>
    </div>
  );
}
