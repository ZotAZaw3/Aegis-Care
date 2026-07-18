import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LayoutList, Inbox, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ordersDb } from "@/lib/orders";
import { useI18n } from "@/lib/i18n";
import { useAuth, useHasRole } from "@/lib/auth";
import { useStaffId } from "@/lib/use-staff-id";
import { resolveHome } from "@/lib/resolve-home";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/shared/stat-tile";
import { OpenCasesBoard } from "@/components/manager/open-cases-board";
import { PendingReviewQueue } from "@/components/dentist/pending-review-queue";

const HANGING = ["open", "routed", "in_progress", "awaiting_review"];

// Workspace bác sĩ: quick-stats + hàng đợi khám + chờ duyệt → /visits/$id (ký y lệnh + Judge).
export const Route = createFileRoute("/_authenticated/clinic")({ component: ClinicPage });

function ClinicPage() {
  const { t } = useI18n();
  const { roles } = useAuth();
  const canView = useHasRole("dentist", "admin");
  const staffId = useStaffId();

  const { data: stats } = useQuery({
    queryKey: ["clinic-stats", staffId],
    enabled: canView,
    queryFn: async () => {
      const [oc, pr, ov] = await Promise.all([
        supabase.from("visit_sessions").select("*", { count: "exact", head: true }).not("status", "in", "(done,transferred)"),
        ordersDb.from("pending_review_orders").select("*", { count: "exact", head: true }),
        ordersDb.from("medical_orders").select("*", { count: "exact", head: true }).in("status", HANGING).lt("due_at", new Date().toISOString()),
      ]);
      return { open: oc.count ?? 0, review: pr.count ?? 0, overdue: ov.count ?? 0 };
    },
    refetchInterval: 30_000,
  });

  if (!canView) return <Navigate to={resolveHome(roles) as string} replace />;

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav_clinic")} description={t("clinic_subtitle")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile icon={<LayoutList className="h-4 w-4" />} label={t("open_cases")} value={stats?.open ?? 0} />
        <StatTile icon={<Inbox className="h-4 w-4" />} label={t("pending_review")} value={stats?.review ?? 0} />
        <StatTile icon={<Clock className="h-4 w-4" />} label={t("ops_kpi_overdue")} value={stats?.overdue ?? 0} tone="warn" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OpenCasesBoard />
        <PendingReviewQueue staffId={staffId} />
      </div>
    </div>
  );
}
