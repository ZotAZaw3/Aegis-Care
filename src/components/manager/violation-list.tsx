import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertOctagon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { ordersDb } from "@/lib/orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Kind = "overdue_open" | "open_at_case_close" | "procedure_closed_consent_open";

interface OrderViolation {
  id: string;
  visit_session_id: string;
  patient_id: string;
  order_type: string;
  title: string;
  status: string;
  assigned_role: string | null;
  due_at: string | null;
  opened_at: string | null;
  violation_kind: Kind;
}

const KIND_KEY: Record<Kind, string> = {
  overdue_open: "vk_overdue_open",
  open_at_case_close: "vk_open_at_case_close",
  procedure_closed_consent_open: "vk_procedure_closed_consent_open",
};
const KINDS = Object.keys(KIND_KEY) as Kind[];
const ROLES = ["dentist", "assistant", "receptionist", "lab_technician"] as const;

function overdueLabel(dueAt: string | null, t: (k: string) => string): string | null {
  if (!dueAt) return null;
  const ms = Date.now() - new Date(dueAt).getTime();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins >= 1440) return `${Math.floor(mins / 1440)} ${t("dur_day")}`;
  if (mins >= 60) return `${Math.floor(mins / 60)} ${t("dur_hour")}`;
  return `${Math.max(1, mins)} ${t("dur_min")}`;
}

export function ViolationList() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [kind, setKind] = useState<string>("all");
  const [role, setRole] = useState<string>("all");

  const { data: rows, isLoading } = useQuery<OrderViolation[]>({
    queryKey: ["order-violations"],
    queryFn: async () => {
      const { data, error } = await ordersDb
        .from("order_violations")
        .select("*")
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data as OrderViolation[]) ?? [];
    },
  });

  // Enrich each violation with case number + patient name.
  const sessionIds = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.visit_session_id))),
    [rows],
  );
  const { data: caseMap } = useQuery({
    queryKey: ["violation-cases", sessionIds],
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
      .channel("manager-violations")
      .on("postgres_changes", { event: "*", schema: "public", table: "medical_orders" }, () => {
        qc.invalidateQueries({ queryKey: ["order-violations"] });
        qc.invalidateQueries({ queryKey: ["open-cases"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const filtered = (rows ?? []).filter(
    (r) => (kind === "all" || r.violation_kind === kind) && (role === "all" || r.assigned_role === role),
  );

  return (
    <Card>
      <CardHeader className="gap-3 space-y-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertOctagon className="h-4 w-4 text-destructive" />
            {t("violations")}
            {!isLoading && (
              <Badge variant="secondary" className="ml-1 tabular-nums">{filtered.length}</Badge>
            )}
          </CardTitle>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-8 w-auto min-w-[11rem] text-xs">
              <SelectValue placeholder={t("violation_kind")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_kinds")}</SelectItem>
              {KINDS.map((k) => <SelectItem key={k} value={k}>{t(KIND_KEY[k])}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-8 w-auto min-w-[9rem] text-xs">
              <SelectValue placeholder={t("assigned_role")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_roles")}</SelectItem>
              {ROLES.map((r) => <SelectItem key={r} value={r}>{t(r)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">{t("no_violations")}</div>
        ) : (
          <ul className="divide-y">
            {filtered.map((r) => {
              const c = caseMap?.[r.visit_session_id];
              const od = overdueLabel(r.due_at, t);
              return (
                <li key={r.id}>
                  <Link
                    to="/visits/$id" params={{ id: r.visit_session_id }}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{c?.name ?? "—"}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t("case_label")} #{c?.session_number ?? "—"}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{r.title}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="destructive" className="text-[10px] whitespace-nowrap">
                        {t(KIND_KEY[r.violation_kind])}
                      </Badge>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">{t(r.order_type)}</Badge>
                        {r.assigned_role && <span>{t(r.assigned_role)}</span>}
                        {od && <span className="font-medium text-destructive">{t("overdue_by")} {od}</span>}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
