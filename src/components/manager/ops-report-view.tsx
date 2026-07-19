// Hiển thị 1 báo cáo vận hành theo BỐ CỤC BẢNG NỘI DUNG (giống bàn giao ca):
// header kỳ + hộp Tóm tắt (AI) + ghi chú luật + danh sách vấn đề bung chi tiết (đỏ trước) + Phân tích Δ.
// Dòng = highlights TẤT ĐỊNH từ metrics; phần thuật = report AI (Mức 1). KHÔNG tự đếm ở client.
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Metrics = any;

// Tách một mục "## X" trong report markdown (LLM sinh đúng 3 mục: Tóm tắt / Vấn đề nổi bật / Phân tích).
function section(report: string | null, name: string): string | null {
  if (!report) return null;
  const parts = report.split(/^##\s+/m).map((s) => s.trim()).filter(Boolean);
  const p = parts.find((x) => x.toLowerCase().startsWith(name.toLowerCase()));
  return p ? p.slice(name.length).replace(/^[:\s]+/, "").trim() || null : null;
}

function KV({ obj }: { obj: Record<string, unknown> | null | undefined }) {
  const entries = Object.entries(obj ?? {}).filter(([, v]) => v != null && v !== 0);
  if (entries.length === 0) return <span className="text-muted-foreground italic">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className="rounded border bg-background px-2 py-0.5 text-xs">
          {k}: <span className="font-medium tabular-nums">{String(v)}</span>
        </span>
      ))}
    </div>
  );
}

interface Row {
  key: string;
  label: string;
  flagged: boolean;
  value: string;
  detail: ReactNode;
}

export function OpsReportView({ report, metrics }: { report: string | null; metrics: Metrics }) {
  const { t } = useI18n();
  const m = metrics ?? {};
  const H = m.highlights ?? {};
  const summary = section(report, "Tóm tắt");
  const analysis = section(report, "Phân tích");

  const num = (x: unknown) => (typeof x === "number" ? x : 0);

  const rows: Row[] = [
    {
      key: "overdue",
      label: t("ops_row_overdue"),
      flagged: num(m.orders?.overdue) > 0 || num(m.violations?.total) > 0,
      value: `${num(m.orders?.overdue)} ${t("ops_overdue_short")} · ${num(m.violations?.total)} ${t("ops_violation_short")}`,
      detail: (
        <div className="space-y-1.5">
          {H.oldest_overdue_order && (
            <div>{t("ops_oldest_overdue")}: <b>{H.oldest_overdue_order.title}</b> — {H.oldest_overdue_order.days_overdue} {t("ops_days")}</div>
          )}
          <div className="text-muted-foreground">{t("ops_by_kind")}:</div>
          <KV obj={m.violations?.by_kind} />
          <div className="text-muted-foreground">{t("ops_by_role")}:</div>
          <KV obj={m.violations?.by_role} />
        </div>
      ),
    },
    {
      key: "judge",
      label: t("ops_row_judge"),
      flagged: num(m.judge?.unacked) > 0,
      value: `${num(m.judge?.unacked)} ${t("ops_unacked_short")} · ${num(m.judge?.has_findings)} ${t("ops_findings_short")}`,
      detail: (
        <div className="space-y-1">
          <div>{t("ops_judge_today")}: <b>{num(m.judge?.today)}</b></div>
          {H.oldest_unacked_finding && (
            <div>{t("ops_oldest_finding")}: <b>{H.oldest_unacked_finding.procedure_type}</b> — {H.oldest_unacked_finding.days} {t("ops_days")}</div>
          )}
        </div>
      ),
    },
    {
      key: "anticoag",
      label: t("ops_row_anticoag"),
      flagged: num(H.anticoag_missing_inr) > 0,
      value: `${num(H.anticoag_missing_inr)} ${t("ops_patients_short")}`,
      detail: <div className="text-muted-foreground">{t("ops_anticoag_note")}</div>,
    },
    {
      key: "pending",
      label: t("ops_row_pending"),
      flagged: false,
      value: H.top_pending_review_dentist
        ? `${H.top_pending_review_dentist.dentist}: ${H.top_pending_review_dentist.count}`
        : "—",
      detail: (
        <div className="space-y-1">
          {(m.workload?.pending_review_by_dentist ?? []).length === 0 ? (
            <span className="text-muted-foreground italic">—</span>
          ) : (
            (m.workload?.pending_review_by_dentist ?? []).map((d: { dentist: string; count: number }, i: number) => (
              <div key={i}>{d.dentist}: <b className="tabular-nums">{d.count}</b></div>
            ))
          )}
        </div>
      ),
    },
    {
      key: "workload",
      label: t("ops_row_workload"),
      flagged: false,
      value: t("ops_open_orders"),
      detail: <KV obj={m.workload?.orders_open_by_role} />,
    },
  ];

  const sorted = [...rows].sort((a, b) => (a.flagged === b.flagged ? 0 : a.flagged ? -1 : 1));
  const p = m.patients ?? {};

  return (
    <div className="space-y-3">
      {/* Header kỳ */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        {m.period && <div><span className="text-muted-foreground">{t("ops_meta_period")}: </span><span className="font-medium">{m.period.from}{m.period.to !== m.period.from ? ` → ${m.period.to}` : ""}</span></div>}
        <div><span className="text-muted-foreground">{t("ops_meta_patients")}: </span><span className="font-medium tabular-nums">{num(p.visits_today_waiting)} chờ · {num(p.visits_today_in_exam)} đang khám · {num(p.visits_today_done)} xong</span></div>
      </div>

      {/* Hộp tóm tắt AI */}
      {summary && (
        <div className="rounded-md border border-l-[3px] border-l-primary bg-primary/5 px-4 py-3 text-sm leading-relaxed">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">{t("ops_summary_ai")}</div>
          {summary}
        </div>
      )}

      {/* Ghi chú luật */}
      <details className="rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">{t("ops_rule_note")}</summary>
        <p className="mt-2">{t("ops_rule_body")}</p>
      </details>

      {/* Danh sách vấn đề (đỏ trước) */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">{t("ops_highlights")}</h3>
          <div className="flex gap-3 text-[11px] text-muted-foreground">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-destructive align-middle" />{t("ops_flagged")}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-success align-middle" />{t("ops_stable")}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          {sorted.map((r) => (
            <details key={r.key} className={cn("group rounded-md border border-l-4", r.flagged ? "border-l-destructive" : "border-l-success")}>
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", r.flagged ? "bg-destructive" : "bg-success")} />
                <span className="font-medium">{r.label}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">{r.value}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-t px-3 py-2 text-sm">{r.detail}</div>
            </details>
          ))}
        </div>
      </div>

      {/* Phân tích Δ */}
      {(analysis || m.delta) && (
        <div className="rounded-md border bg-card px-4 py-3 text-sm">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("ops_analysis")}</div>
          {m.delta && (
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span>{t("ops_delta_visits")}: <b className="tabular-nums">{num(m.delta.visits_today)}</b> <span className="text-muted-foreground">/ {num(m.delta.visits_yesterday)} {t("ops_yesterday")}</span></span>
              <span>{t("ops_delta_closed")}: <b className="tabular-nums">{num(m.delta.orders_closed_today)}</b> <span className="text-muted-foreground">/ {num(m.delta.orders_closed_yesterday)} {t("ops_yesterday")}</span></span>
            </div>
          )}
          {analysis && <p className="leading-relaxed text-muted-foreground">{analysis}</p>}
        </div>
      )}

      <div className="rounded-md bg-primary/5 py-2.5 text-center text-xs font-medium">{t("ops_closing")}</div>
    </div>
  );
}
