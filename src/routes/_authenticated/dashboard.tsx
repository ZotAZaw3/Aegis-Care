import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ComplianceRing } from "@/components/compliance-ring";
import { AlertTriangle, CalendarClock, ClipboardList, Activity, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const STAGES = ["pending", "called", "in_exam", "waiting_lab", "waiting_recall", "finalizing", "done"] as const;

function DashboardPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  // Try to escalate overdue on load (safe if function not present)
  useEffect(() => {
    (supabase.rpc as any)("escalate_overdue_followups").then?.(() => {
      qc.invalidateQueries({ queryKey: ["alerts-bell"] });
      qc.invalidateQueries({ queryKey: ["alerts-feed"] });
      qc.invalidateQueries({ queryKey: ["kpi-overdue"] });
    }).catch?.(() => {});
  }, [qc]);

  const { data: sessions } = useQuery({
    queryKey: ["kanban-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_sessions")
        .select("id, status, compliance_score, created_at, procedure_type, patients(full_name), staff!visit_sessions_assigned_dentist_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: alertCounts } = useQuery({
    queryKey: ["kpi-alerts"],
    queryFn: async () => {
      const { data } = await supabase.from("alerts").select("severity").is("dismissed_at", null);
      const rows = data ?? [];
      return {
        total: rows.length,
        warning: rows.filter((r: any) => r.severity === "warning").length,
        critical: rows.filter((r: any) => r.severity === "critical").length,
      };
    },
  });

  const { data: overdue } = useQuery({
    queryKey: ["kpi-overdue"],
    queryFn: async () => {
      const { count } = await supabase
        .from("follow_ups")
        .select("id", { count: "exact", head: true })
        .eq("status", "scheduled")
        .lt("due_date", new Date().toISOString());
      return count ?? 0;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("kanban-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["kanban-sessions"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const closedToday = (sessions ?? []).filter((s: any) => {
    if (s.status !== "done" || s.compliance_score == null) return false;
    const d = new Date(s.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const clinicRate = closedToday.length
    ? Math.round(closedToday.reduce((s: number, x: any) => s + Number(x.compliance_score ?? 0), 0) / closedToday.length)
    : null;

  const activeCount = (sessions ?? []).filter((s: any) => s.status !== "done").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">{t("dashboard")}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title={t("clinic_compliance")} icon={<Activity className="h-4 w-4 text-primary" />}>
          <div className="flex items-center gap-3">
            <ComplianceRing value={clinicRate} size={56} strokeWidth={6} />
            <div className="text-xs text-muted-foreground">{closedToday.length} {t("closed")}</div>
          </div>
        </KpiCard>
        <KpiCard title={t("open_alerts")} icon={<AlertTriangle className="h-4 w-4 text-warning" />}>
          <div className="text-3xl font-semibold">{alertCounts?.total ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1">
            <span className="text-destructive">{alertCounts?.critical ?? 0} {t("critical")}</span>
            {" · "}
            <span className="text-warning">{alertCounts?.warning ?? 0} {t("warning")}</span>
          </div>
        </KpiCard>
        <KpiCard title={t("overdue_followups")} icon={<CalendarClock className="h-4 w-4 text-destructive" />}>
          <div className="text-3xl font-semibold text-destructive">{overdue ?? 0}</div>
          <Link to="/follow-ups" className="text-xs text-primary hover:underline">{t("view")} →</Link>
        </KpiCard>
        <KpiCard title={t("active_sessions")} icon={<ClipboardList className="h-4 w-4 text-primary" />}>
          <div className="text-3xl font-semibold">{activeCount}</div>
        </KpiCard>
      </div>

      {/* Kanban */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t("kanban")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            {STAGES.map((stage) => {
              const items = (sessions ?? []).filter((s: any) => s.status === stage);
              return (
                <div key={stage} className="rounded-lg bg-secondary p-2 min-h-[120px]">
                  <div className="flex items-center justify-between px-1 pb-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(stage)}</div>
                    <div className="text-xs text-muted-foreground">{items.length}</div>
                  </div>
                  <div className="space-y-2">
                    {items.map((s: any) => {
                      const patient = Array.isArray(s.patients) ? s.patients[0] : s.patients;
                      const dentist = Array.isArray(s.staff) ? s.staff[0] : s.staff;
                      return (
                        <Link key={s.id} to="/visits/$id" params={{ id: s.id }} className="block">
                          <div className="rounded-md border bg-card p-2 hover:border-primary transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-medium text-sm truncate">{patient?.full_name ?? "—"}</div>
                                <div className="text-[11px] text-muted-foreground">{s.procedure_type ? t(s.procedure_type) : "—"}</div>
                                <div className="text-[11px] text-muted-foreground truncate">{dentist?.full_name ?? "—"}</div>
                              </div>
                              <ComplianceRing value={s.compliance_score} size={34} strokeWidth={4} />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AlertsFeed />
        <ExceptionLog />
      </div>
    </div>
  );
}

function KpiCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function AlertsFeed() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["alerts-feed"],
    queryFn: async () => {
      const { data } = await supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });
  const dismiss = async (id: string) => {
    await supabase.from("alerts").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["alerts-feed"] });
    qc.invalidateQueries({ queryKey: ["alerts-bell"] });
    qc.invalidateQueries({ queryKey: ["kpi-alerts"] });
  };
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("alerts")}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {(data ?? []).length === 0 && <div className="text-sm text-muted-foreground">{t("no_alerts")}</div>}
        {(data ?? []).map((a: any) => {
          const border =
            a.severity === "critical" ? "border-l-destructive"
              : a.severity === "warning" ? "border-l-warning"
              : "border-l-primary";
          return (
            <div key={a.id} className={cn("border-l-4 rounded-md border bg-card p-2 flex items-start gap-2", border, a.dismissed_at && "opacity-60")}>
              <div className="flex-1 min-w-0">
                <div className="text-sm">{a.message}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
              </div>
              {a.session_id && (
                <Link to="/visits/$id" params={{ id: a.session_id }} className="text-xs text-primary hover:underline">{t("view")}</Link>
              )}
              {!a.dismissed_at && (
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => dismiss(a.id)}>{t("dismiss")}</button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ExceptionLog() {
  const { t } = useI18n();
  const { data } = useQuery({
    queryKey: ["exception-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("checklist_items")
        .select("id, session_id, exception_reason, exception_category, completed_at, checklist_rules(label, label_vi), staff(full_name)")
        .eq("status", "exception")
        .order("completed_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const exportCsv = () => {
    const rows = [["Session", "Item", "Category", "Reason", "By", "At"]];
    (data ?? []).forEach((r: any) => {
      const rule = Array.isArray(r.checklist_rules) ? r.checklist_rules[0] : r.checklist_rules;
      const s = Array.isArray(r.staff) ? r.staff[0] : r.staff;
      rows.push([r.session_id, rule?.label ?? "", r.exception_category ?? "", (r.exception_reason ?? "").replace(/\n/g, " "), s?.full_name ?? "", r.completed_at ?? ""]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `exceptions-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t("exception_log")}</CardTitle>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> {t("export_csv")}</Button>
      </CardHeader>
      <CardContent>
        {(data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("no_data")}</div>
        ) : (
          <div className="max-h-72 overflow-auto text-sm">
            <table className="w-full">
              <thead className="text-xs text-muted-foreground text-left">
                <tr>
                  <th className="py-1">{t("checklist")}</th>
                  <th className="py-1">{t("reason_category")}</th>
                  <th className="py-1">{t("scheduled_at")}</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((r: any) => {
                  const rule = Array.isArray(r.checklist_rules) ? r.checklist_rules[0] : r.checklist_rules;
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 pr-2">
                        <Link to="/visits/$id" params={{ id: r.session_id }} className="hover:text-primary">
                          {rule?.label_vi ?? rule?.label}
                        </Link>
                      </td>
                      <td className="py-2 pr-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/30">
                          {r.exception_category ? t(r.exception_category) : t("reason_other")}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">{r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}