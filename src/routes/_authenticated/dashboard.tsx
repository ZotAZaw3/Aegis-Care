import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { ViolationList } from "@/components/manager/violation-list";
import { AlertsFeed } from "@/components/manager/alerts-feed";
import { OpenCasesBoard } from "@/components/manager/open-cases-board";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  // Best-effort escalation refresh on load (safe if function absent).
  useEffect(() => {
    (supabase.rpc as any)("escalate_overdue_followups").then?.(() => {
      qc.invalidateQueries({ queryKey: ["alerts-feed"] });
      qc.invalidateQueries({ queryKey: ["order-violations"] });
    }).catch?.(() => {});
  }, [qc]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">{t("dashboard")}</h1>
        <p className="text-sm text-muted-foreground">{t("violations_subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ViolationList />
        </div>
        <div className="space-y-4">
          <AlertsFeed />
          <OpenCasesBoard />
        </div>
      </div>
    </div>
  );
}
