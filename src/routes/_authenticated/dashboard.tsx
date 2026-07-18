import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OpenCasesBoard } from "@/components/manager/open-cases-board";
import { CopilotHome } from "@/components/home/copilot-home";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const qc = useQueryClient();

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
      <div className="mx-auto w-full max-w-2xl">
        <OpenCasesBoard />
      </div>
    </div>
  );
}
