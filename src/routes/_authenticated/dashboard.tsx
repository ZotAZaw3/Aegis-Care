import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHasRole } from "@/lib/auth";
import { OpenCasesBoard } from "@/components/manager/open-cases-board";
import { OpsKpiCards } from "@/components/manager/ops-kpi-cards";
import { OpsTrendChart } from "@/components/manager/ops-trend-chart";
import { OpsWorkloadByRole } from "@/components/manager/ops-workload-by-role";
import { OpsReportPanel } from "@/components/manager/ops-report-panel";
import { CopilotHome } from "@/components/home/copilot-home";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const qc = useQueryClient();
  const isAdmin = useHasRole("admin");

  // Best-effort escalation refresh on load (safe if function absent).
  useEffect(() => {
    (supabase.rpc as any)("escalate_overdue_followups")
      .then?.(() => {
        qc.invalidateQueries({ queryKey: ["alerts-bell"] });
        qc.invalidateQueries({ queryKey: ["alerts-bell-violations"] });
      })
      .catch?.(() => {});
  }, [qc]);

  return (
    <div className="flex flex-col gap-6">
      <CopilotHome />
      {isAdmin ? (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <OpsKpiCards />
          <div className="grid gap-4 lg:grid-cols-2">
            <OpsTrendChart />
            <OpsWorkloadByRole />
          </div>
          <OpsReportPanel />
          <OpenCasesBoard />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-2xl">
          <OpenCasesBoard />
        </div>
      )}
    </div>
  );
}
