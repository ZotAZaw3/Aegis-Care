import { useEffect } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useHasRole } from "@/lib/auth";
import { resolveHome } from "@/lib/resolve-home";
import { OpsKpiCards } from "@/components/manager/ops-kpi-cards";
import { OpsTrendChart } from "@/components/manager/ops-trend-chart";
import { OpsWorkloadByRole } from "@/components/manager/ops-workload-by-role";
import { OpsReportPanel } from "@/components/manager/ops-report-panel";

// Dashboard = báo cáo vận hành (Ops) cho ADMIN + BÁC SĨ (has_ops_access). Vai khác redirect về workspace.
export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  // Ops mở cho admin + bác sĩ (has_ops_access ở DB khớp với gate này).
  const canView = useHasRole("admin", "dentist");

  // Best-effort escalation refresh on load (safe if function absent).
  useEffect(() => {
    (supabase.rpc as any)("escalate_overdue_followups")
      .then?.(() => {
        qc.invalidateQueries({ queryKey: ["alerts-bell"] });
        qc.invalidateQueries({ queryKey: ["alerts-bell-violations"] });
      })
      .catch?.(() => {});
  }, [qc]);

  if (!canView) return <Navigate to={resolveHome(roles) as string} replace />;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <OpsKpiCards />
      <div className="grid gap-4 lg:grid-cols-2">
        <OpsTrendChart />
        <OpsWorkloadByRole />
      </div>
      <OpsReportPanel />
    </div>
  );
}
