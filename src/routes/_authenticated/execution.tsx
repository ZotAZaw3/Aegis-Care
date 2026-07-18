import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useAuth, useHasRole } from "@/lib/auth";
import { resolveHome } from "@/lib/resolve-home";
import { PageHeader } from "@/components/shared/page-header";
import { OrderExecutionList } from "@/components/assistant/order-execution-list";

// Workspace trợ thủ: y lệnh cần thực thi (nộp bằng chứng → đóng order).
export const Route = createFileRoute("/_authenticated/execution")({ component: ExecutionPage });

function ExecutionPage() {
  const { t } = useI18n();
  const { roles } = useAuth();
  const canView = useHasRole("assistant", "admin");

  if (!canView) return <Navigate to={resolveHome(roles) as string} replace />;

  return (
    <div>
      <PageHeader title={t("nav_execution")} description={t("execution_subtitle")} />
      <OrderExecutionList />
    </div>
  );
}
