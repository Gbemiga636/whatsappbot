import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <div className="rounded-3xl border border-white bg-white p-5 shadow-sm shadow-emerald-900/5">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-gray-900 tabular-nums sm:text-3xl">
        {value}
      </p>
      {hint ? (
        <div className="mt-2">
          <Badge
            variant={
              tone === "success"
                ? "success"
                : tone === "warning"
                  ? "warning"
                  : tone === "danger"
                    ? "outline"
                    : "default"
            }
            className={cn(tone === "danger" && "border-red-200 bg-red-50 text-red-700")}
          >
            {hint}
          </Badge>
        </div>
      ) : null}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: { key: string; label: string; className?: string }[];
  rows: Record<string, React.ReactNode>[];
  empty?: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-[#F3F6F4] px-4 py-12 text-center text-sm text-gray-500">
        {empty || "No rows yet"}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-gray-100">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-[#F3F6F4] text-xs font-bold uppercase tracking-wide text-gray-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn("px-4 py-3", c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 bg-white">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-emerald-50/40">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3.5 text-gray-700", c.className)}>
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LiveBadge({ live }: { live: boolean }) {
  return (
    <Badge variant={live ? "success" : "warning"}>
      {live ? "Live Supabase" : "Demo data — connect Supabase service role"}
    </Badge>
  );
}

export function AdminPageHeader({
  title,
  description,
  live,
}: {
  title: string;
  description: string;
  live?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      {typeof live === "boolean" ? <LiveBadge live={live} /> : null}
    </div>
  );
}

export function AdminPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-white bg-white p-5 shadow-sm shadow-emerald-900/5 sm:p-6">
      {children}
    </div>
  );
}
