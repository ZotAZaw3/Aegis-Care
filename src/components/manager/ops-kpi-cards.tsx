// Hàng thẻ KPI vận hành + Δ (mũi tên ↑/↓, KHÔNG %). Số từ get_ops_metrics.
import { ArrowDown, ArrowUp, Minus, Users, Clock, AlertTriangle, ShieldAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpsMetrics } from "./use-ops-metrics";

function Delta({ today, yesterday, label }: { today: number; yesterday: number; label: string }) {
  const diff = today - yesterday;
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
  const color = diff > 0 ? "text-amber-600" : diff < 0 ? "text-emerald-600" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />
      {diff > 0 ? "+" : ""}{diff} {label}
    </span>
  );
}

function KpiCard({
  icon, title, value, children, tone,
}: {
  icon: React.ReactNode; title: string; value: number; children?: React.ReactNode; tone?: "danger" | "warn";
}) {
  const valueColor = tone === "danger" && value > 0 ? "text-destructive" : tone === "warn" && value > 0 ? "text-amber-600" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{title}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
        <div className="mt-0.5 min-h-4">{children}</div>
      </CardContent>
    </Card>
  );
}

export function OpsKpiCards() {
  const { t } = useI18n();
  const { data: m, isLoading } = useOpsMetrics();

  if (isLoading || !m) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard icon={<Users className="h-4 w-4" />} title={t("ops_kpi_visits_today")} value={m.delta.visits_today}>
        <Delta today={m.delta.visits_today} yesterday={m.delta.visits_yesterday} label={t("ops_vs_yesterday")} />
      </KpiCard>
      <KpiCard icon={<Clock className="h-4 w-4" />} title={t("ops_kpi_overdue")} value={m.orders.overdue} tone="warn">
        <Delta today={m.delta.violations_new_today} yesterday={m.delta.violations_new_yesterday} label={t("ops_new_label")} />
      </KpiCard>
      <KpiCard icon={<AlertTriangle className="h-4 w-4" />} title={t("ops_kpi_violations")} value={m.violations.total} tone="danger" />
      <KpiCard icon={<ShieldAlert className="h-4 w-4" />} title={t("ops_kpi_unacked")} value={m.judge.unacked} tone="danger">
        <span className="text-[11px] text-muted-foreground tabular-nums">{m.judge.today} {t("ops_judge_today")}</span>
      </KpiCard>
    </div>
  );
}
