import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useAuth, useHasRole } from "@/lib/auth";
import { resolveHome } from "@/lib/resolve-home";
import { PageHeader } from "@/components/shared/page-header";
import { LabBoard } from "@/components/lab/lab-board";

// Workspace lab tech: lab cần làm + hoàn tất nhập kết quả (→ emr_observations source='clinic').
export const Route = createFileRoute("/_authenticated/lab")({ component: LabPage });

function LabPage() {
  const { t } = useI18n();
  const { roles } = useAuth();
  const canView = useHasRole("lab_technician", "admin");

  if (!canView) return <Navigate to={resolveHome(roles) as string} replace />;

  return (
    <div>
      <PageHeader title={t("nav_lab")} description={t("lab_subtitle")} />
      <LabBoard />
    </div>
  );
}
