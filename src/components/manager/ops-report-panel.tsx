// Nút "Tạo báo cáo vận hành" → POST /api/ops-report (JWT) → hiện báo cáo (Mức 1) + lịch sử đã lưu.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2 } from "lucide-react";
import { getFreshToken } from "@/lib/session-token";
import { ordersDb } from "@/lib/orders";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OpsReportView } from "./ops-report-view";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface OpsReportRow { id: string; report: string | null; metrics: any; created_at: string; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CurrentReport = { report: string | null; metrics: any };

export function OpsReportPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [current, setCurrent] = useState<CurrentReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: history, isLoading } = useQuery<OpsReportRow[]>({
    queryKey: ["ops-reports"],
    queryFn: async () => {
      const { data, error } = await ordersDb
        .from("ops_reports")
        .select("id, report, metrics, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data as OpsReportRow[]) ?? [];
    },
  });

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const token = await getFreshToken();
      if (!token) { setError(t("copilot_error_auth")); return; }
      const res = await fetch("/api/ops-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) { setError(res.status === 403 ? t("ops_forbidden") : t("ops_report_error")); return; }
      const json = await res.json();
      setCurrent({ report: json.report ?? null, metrics: json.metrics ?? null });
      qc.invalidateQueries({ queryKey: ["ops-reports"] });
    } catch {
      setError(t("ops_report_error"));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-muted-foreground" />
          {t("ops_report_title")}
        </CardTitle>
        <Button size="sm" onClick={generate} disabled={generating}>
          {generating && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {t("ops_report_generate")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">{error}</div>}
        {current && (
          current.metrics
            ? <OpsReportView report={current.report} metrics={current.metrics} />
            : <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">{current.report ?? t("ops_report_llm_unavailable")}</div>
        )}
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t("ops_report_history")}</div>
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (history ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("ops_none")}</div>
          ) : (
            <div className="space-y-1">
              {(history ?? []).map((r) => (
                <button
                  key={r.id}
                  onClick={() => setCurrent({ report: r.report, metrics: r.metrics })}
                  className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left text-sm hover:border-primary transition-colors"
                >
                  <span className="truncate">{new Date(r.created_at).toLocaleString("vi-VN")}</span>
                  {!r.report && <span className="shrink-0 text-[11px] text-muted-foreground">{t("ops_report_no_text")}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
