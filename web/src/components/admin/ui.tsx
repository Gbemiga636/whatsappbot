import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="hover:shadow-md">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums sm:text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint && (
        <CardContent>
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
            className={cn(tone === "danger" && "border-red-200 text-red-700 bg-red-50")}
          >
            {hint}
          </Badge>
        </CardContent>
      )}
    </Card>
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
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-12 text-center text-sm text-gray-500">
        {empty || "No rows yet"}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
            {columns.map((c) => (
              <th key={c.key} className={cn("pb-3 font-medium", c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              {columns.map((c) => (
                <td key={c.key} className={cn("py-3.5 text-gray-700", c.className)}>
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
