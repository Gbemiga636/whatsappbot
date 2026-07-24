import { Badge } from "@/components/ui/badge";
import { FaIcon } from "@/components/shared/fa-icon";
import { cn } from "@/lib/utils";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import Link from "next/link";

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
    <div className="rounded-3xl border border-white bg-white p-5 shadow-sm shadow-violet-900/5">
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

export function MetricBox({
  label,
  value,
  hint,
  icon,
  tone = "violet",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: IconDefinition;
  tone?: "violet" | "sky" | "amber" | "rose" | "emerald" | "fuchsia" | "orange" | "slate";
  href?: string;
}) {
  const tones: Record<string, string> = {
    violet: "bg-violet-50 text-violet-700",
    sky: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    emerald: "bg-emerald-50 text-emerald-700",
    fuchsia: "bg-fuchsia-50 text-fuchsia-700",
    orange: "bg-orange-50 text-orange-700",
    slate: "bg-slate-100 text-slate-700",
  };

  const body = (
    <div className="group h-full rounded-3xl border border-white bg-white p-5 shadow-sm shadow-violet-900/5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
          <p className="mt-2 truncate text-2xl font-extrabold tracking-tight text-gray-900 tabular-nums">
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
        </div>
        {icon ? (
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
              tones[tone]
            )}
          >
            <FaIcon icon={icon} className="h-4 w-4" />
          </span>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    );
  }
  return body;
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-white bg-white p-5 shadow-sm shadow-violet-900/5 sm:p-6",
        className
      )}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 sm:text-lg">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-gray-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function QuickAction({
  href,
  label,
  hint,
  icon,
  tone = "violet",
}: {
  href: string;
  label: string;
  hint: string;
  icon: IconDefinition;
  tone?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-[#F8F6FC] p-4 transition hover:border-violet-200 hover:bg-violet-50"
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
          tone
        )}
      >
        <FaIcon icon={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="font-bold text-gray-900">{label}</p>
        <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
      </div>
    </Link>
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
      <div className="rounded-2xl border border-dashed border-gray-200 bg-[#F5F3FA] px-4 py-12 text-center text-sm text-gray-500">
        {empty || "No rows yet"}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-gray-100">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-[#F5F3FA] text-xs font-bold uppercase tracking-wide text-gray-500">
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
            <tr key={i} className="hover:bg-violet-50/40">
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
  actions,
}: {
  title: string;
  description: string;
  live?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {typeof live === "boolean" ? <LiveBadge live={live} /> : null}
        {actions}
      </div>
    </div>
  );
}

export function AdminPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-white bg-white p-5 shadow-sm shadow-violet-900/5 sm:p-6">
      {children}
    </div>
  );
}
