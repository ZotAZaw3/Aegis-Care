import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useAuth, useHasRole } from "@/lib/auth";
import { useStaffId } from "@/lib/use-staff-id";
import { resolveHome } from "@/lib/resolve-home";
import { PageHeader } from "@/components/shared/page-header";
import { OpenCasesBoard } from "@/components/manager/open-cases-board";
import { PendingReviewQueue } from "@/components/dentist/pending-review-queue";

// Workspace bác sĩ: hàng đợi khám + chờ tôi duyệt → click ca vào /visits/$id (ký y lệnh + Judge).
export const Route = createFileRoute("/_authenticated/clinic")({ component: ClinicPage });

function ClinicPage() {
  const { t } = useI18n();
  const { roles } = useAuth();
  const canView = useHasRole("dentist", "admin");
  const staffId = useStaffId();

  if (!canView) return <Navigate to={resolveHome(roles) as string} replace />;

  return (
    <div>
      <PageHeader title={t("nav_clinic")} description={t("clinic_subtitle")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <OpenCasesBoard />
        <PendingReviewQueue staffId={staffId} />
      </div>
    </div>
  );
}
