import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sessions/$id")({
  component: SessionPage,
});

const STAGES = ["scheduled", "intake", "pre_check", "in_treatment", "post_treatment", "closed"] as const;

function SessionPage() {
  const { id } = Route.useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [exceptionItem, setExceptionItem] = useState<string | null>(null);
  const [exceptionReason, setExceptionReason] = useState("");

  const { data: session } = useQuery({
    queryKey: ["session", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_sessions")
        .select("*, appointments(procedure_type, scheduled_at, patients(id, full_name), staff!appointments_dentist_id_fkey(full_name))")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const appt: any = session ? (Array.isArray(session.appointments) ? session.appointments[0] : session.appointments) : null;
  const patient = appt ? (Array.isArray(appt.patients) ? appt.patients[0] : appt.patients) : null;

  const { data: allergies } = useQuery({
    queryKey: ["session-allergies", patient?.id],
    enabled: !!patient?.id,
    queryFn: async () => (await supabase.from("patient_allergies").select("*").eq("patient_id", patient!.id)).data ?? [],
  });

  const { data: items } = useQuery({
    queryKey: ["checklist", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_items")
        .select("*, checklist_rules(*)")
        .eq("session_id", id);
      if (error) throw error;
      return (data ?? []).sort((a: any, b: any) => (a.checklist_rules?.sort_order ?? 0) - (b.checklist_rules?.sort_order ?? 0));
    },
  });

  const toggleDone = async (item: any) => {
    const staffRes = await supabase.from("staff").select("id").eq("user_id", user!.id).single();
    const staffId = staffRes.data?.id;
    if (item.status === "done") {
      await supabase.from("checklist_items").update({ status: "pending", completed_at: null, completed_by: null }).eq("id", item.id);
    } else {
      await supabase.from("checklist_items").update({ status: "done", completed_at: new Date().toISOString(), completed_by: staffId, exception_reason: null }).eq("id", item.id);
    }
    qc.invalidateQueries({ queryKey: ["checklist", id] });
  };

  const submitException = async () => {
    if (!exceptionItem || !exceptionReason.trim()) return;
    const staffRes = await supabase.from("staff").select("id").eq("user_id", user!.id).single();
    const staffId = staffRes.data?.id;
    await supabase.from("checklist_items").update({ status: "exception", exception_reason: exceptionReason, completed_at: new Date().toISOString(), completed_by: staffId }).eq("id", exceptionItem);
    setExceptionItem(null);
    setExceptionReason("");
    qc.invalidateQueries({ queryKey: ["checklist", id] });
  };

  const advance = async () => {
    if (!session) return;
    const idx = STAGES.indexOf(session.pipeline_status as any);
    const next = STAGES[Math.min(idx + 1, STAGES.length - 1)];
    const patch: any = { pipeline_status: next };
    if (next === "closed") {
      const required = (items ?? []).filter((i: any) => i.checklist_rules?.required);
      const completed = required.filter((i: any) => i.status === "done" || i.status === "exception").length;
      const score = required.length ? Math.round((completed / required.length) * 100) : 100;
      patch.compliance_score = score;
      patch.closed_at = new Date().toISOString();
    }
    const { error } = await supabase.from("treatment_sessions").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["session", id] });
  };

  if (!session || !items) return null;

  const grouped = { before: [] as any[], during: [] as any[], after: [] as any[] };
  items.forEach((it: any) => {
    const timing = it.checklist_rules?.trigger_timing as "before" | "during" | "after";
    if (timing) grouped[timing].push(it);
  });

  const dentist = appt ? (Array.isArray(appt.staff) ? appt.staff[0] : appt.staff) : null;
  const isClosed = session.pipeline_status === "closed";

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">{patient?.full_name ?? "—"}</h1>
        <div className="text-sm text-muted-foreground">
          {appt && `${t(appt.procedure_type)} · ${new Date(appt.scheduled_at).toLocaleString()} · ${dentist?.full_name ?? "—"}`}
        </div>
      </div>

      {allergies && allergies.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">{t("allergies")}</div>
            <div>{allergies.map((a: any) => `${a.allergen} (${t(a.severity)})`).join(", ")}</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md border bg-card">
        <div>
          <div className="text-xs text-muted-foreground">{t("status")}</div>
          <div className="font-medium">{t(session.pipeline_status as any)}</div>
        </div>
        <div className="flex items-center gap-3">
          {session.compliance_score != null && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">{t("compliance_score")}</div>
              <div className="text-2xl font-semibold">{Math.round(Number(session.compliance_score))}%</div>
            </div>
          )}
          {!isClosed && (
            <Button onClick={advance}>
              {STAGES[STAGES.indexOf(session.pipeline_status as any) + 1] === "closed" ? t("close_session") : t("advance_stage")}
            </Button>
          )}
        </div>
      </div>

      {(["before", "during", "after"] as const).map((timing) => (
        grouped[timing].length > 0 && (
          <Card key={timing}>
            <CardHeader><CardTitle className="text-base">{t(timing)}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {grouped[timing].map((item: any) => {
                const rule = item.checklist_rules;
                const label = lang === "vi" && rule?.label_vi ? rule.label_vi : rule?.label;
                const borderClass =
                  item.status === "done" ? "border-success/60 bg-success/5" :
                  item.status === "exception" ? "border-warning/60 bg-warning/5" :
                  rule?.required ? "border-destructive/30" : "border-border";
                return (
                  <div key={item.id} className={`flex items-center justify-between gap-2 p-3 rounded border ${borderClass}`}>
                    <div className="flex items-center gap-3">
                      <Checkbox checked={item.status === "done"} onCheckedChange={() => !isClosed && toggleDone(item)} disabled={isClosed} />
                      <div>
                        <div className="font-medium">{label} {rule?.required && <span className="text-destructive text-xs">*</span>}</div>
                        <div className="text-xs text-muted-foreground">
                          {t(rule?.assigned_role)} · {t(rule?.category)}
                          {item.status === "exception" && item.exception_reason && ` · ${t("exception")}: ${item.exception_reason}`}
                        </div>
                      </div>
                    </div>
                    {!isClosed && item.status !== "exception" && (
                      <Button size="sm" variant="ghost" onClick={() => setExceptionItem(item.id)}>{t("mark_exception")}</Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )
      ))}

      <Dialog open={!!exceptionItem} onOpenChange={(o) => !o && setExceptionItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("exception_reason")}</DialogTitle></DialogHeader>
          <Textarea value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExceptionItem(null)}>{t("cancel")}</Button>
            <Button onClick={submitException} disabled={!exceptionReason.trim()}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}