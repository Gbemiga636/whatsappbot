import { DashboardShell } from "@/components/dashboard/shell";
import { Overview } from "@/components/dashboard/overview";

export const metadata = {
  title: "Dashboard",
  description: "Bygate wallet overview and activity.",
};

export default function DashboardPage() {
  return (
    <DashboardShell>
      <Overview />
    </DashboardShell>
  );
}
