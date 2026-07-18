import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { currentStaffId } from "@/lib/orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ReceptionSession {
  id: string;
  session_number: number | null;
  bed_number: string | null;
  is_emergency: boolean;
  status: string;
  current_round: number;
  cycle_number: number;
  root_session_id: string | null;
  chief_complaint: string | null;
  diagnosis: string | null;
  created_at: string;
  patients: { id: string; full_name: string } | { id: string; full_name: string }[] | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

type ColumnKey = "waiting" | "called" | "treating" | "wrapup";

const COLUMNS: { key: ColumnKey; statuses: string[]; titleKey: string; accent: string; header: string }[] = [
  { key: "waiting", statuses: ["pending"], titleKey: "col_waiting", accent: "border-t-amber-500", header: "bg-amber-500/10" },
  { key: "called", statuses: ["called"], titleKey: "col_called", accent: "border-t-emerald-500", header: "bg-emerald-500/10" },
  { key: "treating", statuses: ["in_exam", "waiting_lab"], titleKey: "col_treating", accent: "border-t-sky-500", header: "bg-sky-500/10" },
  { key: "wrapup", statuses: ["waiting_recall", "finalizing"], titleKey: "col_wrapup", accent: "border-t-violet-500", header: "bg-violet-500/10" },
];

const ALL_STATUSES = ["pending", "called", "in_exam", "waiting_lab", "waiting_recall", "finalizing"] as const;

export function ReceptionBoard() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: sessions } = useQuery<ReceptionSession[]>({
    queryKey: ["reception-board"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_sessions")
        .select(
          "id, session_number, bed_number, is_emergency, status, current_round, cycle_number, root_session_id, chief_complaint, diagnosis, created_at, patients(id, full_name)",
        )
        .in("status", ALL_STATUSES)
        .order("session_number", { ascending: true });
      if (error) throw error;
      return (data as ReceptionSession[]) ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("reception-board-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["reception-board"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const grouped = useMemo(() => {
    const byColumn: Record<ColumnKey, ReceptionSession[]> = { waiting: [], called: [], treating: [], wrapup: [] };
    (sessions ?? []).forEach((s) => {
      const col = COLUMNS.find((c) => c.statuses.includes(s.status));
      if (col) byColumn[col.key].push(s);
    });
    return byColumn;
  }, [sessions]);

  const callNumber = async (s: ReceptionSession) => {
    const { error } = await supabase.from("visit_sessions").update({ status: "called" }).eq("id", s.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["reception-board"] });
  };

  const resolveFinalize = async (s: ReceptionSession, transfer: boolean) => {
    const patient = one(s.patients);
    if (transfer) {
      if (!patient) return toast.error(t("error"));
      const staffId = user ? await currentStaffId(user.id) : undefined;
      await supabase.from("visit_sessions").update({ status: "transferred" }).eq("id", s.id);
      const { error } = await supabase.from("visit_sessions").insert({
        patient_id: patient.id,
        root_session_id: s.root_session_id ?? s.id,
        cycle_number: (s.cycle_number ?? 1) + 1,
        chief_complaint: s.diagnosis,
        created_by: staffId ?? null,
      });
      if (error) return toast.error(error.message);
      toast.success(t("start_new_cycle"));
    } else {
      await supabase.from("visit_sessions").update({ status: "done", closed_at: new Date().toISOString() }).eq("id", s.id);
      toast.success(t("mark_done_visit"));
    }
    qc.invalidateQueries({ queryKey: ["reception-board"] });
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = grouped[col.key];
        return (
          <div key={col.key} className={cn("rounded-lg border border-t-4 bg-card", col.accent)}>
            <div className={cn("flex items-center justify-between gap-2 rounded-t-[7px] px-3 py-2.5", col.header)}>
              <span className="text-sm font-medium">{t(col.titleKey)}</span>
              <Badge variant="secondary" className="tabular-nums">{items.length}</Badge>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {items.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">{t("queue_empty")}</div>
              ) : (
                items.map((s) => {
                  const patient = one(s.patients);
                  const label = s.bed_number ? `${t("bed_label")} ${s.bed_number}` : `${t("number_label")} ${s.session_number}`;
                  return (
                    <div key={s.id} className="rounded-md border bg-background p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <Link to="/visits/$id" params={{ id: s.id }} className="min-w-0 truncate text-sm font-medium hover:text-primary">
                          {patient?.full_name ?? "—"}
                        </Link>
                        {s.is_emergency && <Badge variant="destructive" className="shrink-0 text-[10px]">{t("emergency")}</Badge>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {label} · {formatTime(s.created_at)}
                        {s.cycle_number > 1 && <> · {t("cycle")} {s.cycle_number}</>}
                      </div>
                      {(s.chief_complaint || s.diagnosis) && (
                        <div className="truncate text-[11px] text-muted-foreground">{s.diagnosis || s.chief_complaint}</div>
                      )}

                      {col.key === "wrapup" && s.status === "finalizing" ? (
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className="text-[11px] text-muted-foreground">{t("transfer_inpatient_question")}</span>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => resolveFinalize(s, true)}>{t("yes")}</Button>
                          <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => resolveFinalize(s, false)}>{t("no")}</Button>
                        </div>
                      ) : col.key === "waiting" || (col.key === "wrapup" && s.status === "waiting_recall") ? (
                        <Button size="sm" className="h-7 w-full text-xs" onClick={() => callNumber(s)}>
                          {s.status === "waiting_recall" ? t("recall_number") : t("call_number")}
                        </Button>
                      ) : col.key === "called" ? (
                        <Link to="/visits/$id" params={{ id: s.id }}>
                          <Button size="sm" variant="outline" className="h-7 w-full text-xs">{t("open_exam")}</Button>
                        </Link>
                      ) : (
                        <Link to="/visits/$id" params={{ id: s.id }}>
                          <Button size="sm" variant="outline" className="h-7 w-full text-xs">{t("view")}</Button>
                        </Link>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
