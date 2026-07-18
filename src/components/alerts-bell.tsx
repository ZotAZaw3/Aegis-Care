import { useEffect, useMemo } from "react";
import { AlertOctagon, Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ordersDb } from "@/lib/orders";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type ViolationKind = "overdue_open" | "open_at_case_close" | "procedure_closed_consent_open";

interface OrderViolation {
  id: string;
  visit_session_id: string;
  title: string;
  violation_kind: ViolationKind;
  due_at: string | null;
}

const VIOLATION_KIND_KEY: Record<ViolationKind, string> = {
  overdue_open: "vk_overdue_open",
  open_at_case_close: "vk_open_at_case_close",
  procedure_closed_consent_open: "vk_procedure_closed_consent_open",
};

function overdueLabel(dueAt: string | null, t: (k: string) => string): string | null {
  if (!dueAt) return null;
  const ms = Date.now() - new Date(dueAt).getTime();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins >= 1440) return `${Math.floor(mins / 1440)} ${t("dur_day")}`;
  if (mins >= 60) return `${Math.floor(mins / 60)} ${t("dur_hour")}`;
  return `${Math.max(1, mins)} ${t("dur_min")}`;
}

export function AlertsBell() {
  const { t } = useI18n();
  const { roles } = useAuth();
  const qc = useQueryClient();

  const { data: alerts } = useQuery({
    queryKey: ["alerts-bell"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alerts")
        .select("*")
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []).filter((a: any) => !a.target_role || roles.includes(a.target_role));
    },
    // No polling here: the realtime subscription below invalidates this
    // query on every insert/update/delete to `alerts`, so a timed refetch
    // on top of that was a redundant GET every 30s for every signed-in user.
  });

  const { data: violations } = useQuery<OrderViolation[]>({
    queryKey: ["alerts-bell-violations"],
    queryFn: async () => {
      const { data, error } = await ordersDb
        .from("order_violations")
        .select("id, visit_session_id, title, violation_kind, due_at")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return (data as OrderViolation[]) ?? [];
    },
  });

  const sessionIds = useMemo(
    () => Array.from(new Set((violations ?? []).map((v) => v.visit_session_id))),
    [violations],
  );
  const { data: caseMap } = useQuery({
    queryKey: ["alerts-bell-violation-cases", sessionIds],
    enabled: sessionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_sessions")
        .select("id, session_number, patients(full_name)")
        .in("id", sessionIds);
      const map: Record<string, { session_number: number | null; name: string }> = {};
      (data ?? []).forEach((s: any) => {
        const p = Array.isArray(s.patients) ? s.patients[0] : s.patients;
        map[s.id] = { session_number: s.session_number, name: p?.full_name ?? "—" };
      });
      return map;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("alerts-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => {
        qc.invalidateQueries({ queryKey: ["alerts-bell"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "medical_orders" }, () => {
        qc.invalidateQueries({ queryKey: ["alerts-bell-violations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const dismiss = async (id: string) => {
    await supabase.from("alerts").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["alerts-bell"] });
  };

  const alertCount = alerts?.length ?? 0;
  const violationCount = violations?.length ?? 0;
  const total = alertCount + violationCount;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold inline-flex items-center justify-center">
              {total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="max-h-[32rem] overflow-auto">
          <div className="p-3 border-b flex items-center justify-between">
            <div className="font-semibold text-sm flex items-center gap-1.5">
              <AlertOctagon className="h-3.5 w-3.5 text-destructive" />
              {t("violations")}
            </div>
            {violationCount > 0 && <Badge variant="secondary" className="tabular-nums">{violationCount}</Badge>}
          </div>
          {violationCount === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground border-b">{t("no_violations")}</div>
          ) : (
            violations!.map((v) => {
              const c = caseMap?.[v.visit_session_id];
              const od = overdueLabel(v.due_at, t);
              return (
                <Link
                  key={v.id}
                  to="/visits/$id" params={{ id: v.visit_session_id }}
                  className="block border-b p-3 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{c?.name ?? "—"}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {t("case_label")} #{c?.session_number ?? "—"}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{v.title}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Badge variant="destructive" className="text-[10px] whitespace-nowrap">
                      {t(VIOLATION_KIND_KEY[v.violation_kind])}
                    </Badge>
                    {od && <span className="text-[10px] font-medium text-destructive">{t("overdue_by")} {od}</span>}
                  </div>
                </Link>
              );
            })
          )}

          <div className="p-3 border-b flex items-center justify-between">
            <div className="font-semibold text-sm">{t("alerts")}</div>
            <span className="text-xs text-muted-foreground">{alertCount} {t("unread")}</span>
          </div>
          {alertCount === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">{t("no_alerts")}</div>
          ) : (
            alerts!.map((a: any) => (
              <AlertItem key={a.id} alert={a} onDismiss={() => dismiss(a.id)} />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AlertItem({ alert, onDismiss }: { alert: any; onDismiss: () => void }) {
  const { t } = useI18n();
  const border =
    alert.severity === "critical" ? "border-l-destructive"
      : alert.severity === "warning" ? "border-l-warning"
      : "border-l-primary";
  return (
    <div className={cn("border-l-4 p-3 border-b bg-card flex items-start gap-2", border)}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{alert.message}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {new Date(alert.created_at).toLocaleString()}
        </div>
        {alert.session_id && (
          <Link to="/visits/$id" params={{ id: alert.session_id }} className="text-xs text-primary hover:underline">
            {t("view")} →
          </Link>
        )}
      </div>
      <button onClick={onDismiss} className="text-xs text-muted-foreground hover:text-foreground">{t("dismiss")}</button>
    </div>
  );
}
