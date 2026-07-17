import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Clock, Circle } from "lucide-react";
import { toast } from "sonner";
import { ComplianceRing } from "@/components/compliance-ring";
import { RoleBadge } from "@/components/role-badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sessions/$id")({
  component: SessionPage,
});

const STAGES = ["scheduled", "intake", "pre_check", "in_treatment", "post_treatment", "closed"] as const;
const REASONS = ["patient_refusal", "equipment_unavailable", "clinical_contraindication", "other"] as const;

function SessionPage() {
  const { id } = Route.useParams();
  const { t, lang } = useI18n();
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const [exceptionItem, setExceptionItem] = useState<any | null>(null);
  const [exceptionCategory, setExceptionCategory] = useState<string>("other");
  const [exceptionReason, setExceptionReason] = useState("");
  const [softBlock, setSoftBlock] = useState(false);

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

  const canCheck = (rule: any) => roles.includes("admin") || roles.includes(rule?.assigned_role);

  const toggleDone = async (item: any) => {
    if (!canCheck(item.checklist_rules)) {
      toast.error(t("only_role_can_check"));
      return;
    }
    const staffRes = await supabase.from("staff").select("id").eq("user_id", user!.id).single();
    const staffId = staffRes.data?.id;
    if (item.status === "done") {
      await supabase.from("checklist_items").update({ status: "pending", completed_at: null, completed_by: null }).eq("id", item.id);
    } else {
      await supabase.from("checklist_items").update({ status: "done", completed_at: new Date().toISOString(), completed_by: staffId, exception_reason: null, exception_category: null }).eq("id", item.id);
    }
    qc.invalidateQueries({ queryKey: ["checklist", id] });
  };

  const openException = (item: any) => {
    setExceptionItem(item);
    setExceptionCategory("other");
    setExceptionReason("");
  };

  const submitException = async () => {
    if (!exceptionItem || !exceptionReason.trim()) return;
    const staffRes = await supabase.from("staff").select("id").eq("user_id", user!.id).single();
    const staffId = staffRes.data?.id;
    await supabase.from("checklist_items").update({
      status: "exception",
      exception_reason: exceptionReason,
      exception_category: exceptionCategory as any,
      completed_at: new Date().toISOString(),
      completed_by: staffId,
    }).eq("id", exceptionItem.id);
    setExceptionItem(null);
    qc.invalidateQueries({ queryKey: ["checklist", id] });
  };

  const advance = async () => {
    if (!session) return;
    const requiredPending = (items ?? []).filter((i: any) => i.checklist_rules?.required && i.status === "pending");
    if (requiredPending.length > 0) {
      setSoftBlock(true);
      toast.error(t("required_pending_warning"));
      return;
    }
    setSoftBlock(false);
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
  const requiredPending = items.filter((i: any) => i.checklist_rules?.required && i.status === "pending");

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{patient?.full_name ?? "—"}</h1>
          <div className="text-sm text-muted-foreground">
            {appt && `${t(appt.procedure_type)} · ${new Date(appt.scheduled_at).toLocaleString()} · ${dentist?.full_name ?? "—"}`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ComplianceRing value={session.compliance_score as any} size={56} strokeWidth={6} />
          <div className="text-xs text-muted-foreground">
            <div>{t("status")}</div>
            <div className="text-sm font-medium text-foreground">{t(session.pipeline_status as any)}</div>
          </div>
          {!isClosed && (
            <Button onClick={advance}>
              {STAGES[STAGES.indexOf(session.pipeline_status as any) + 1] === "closed" ? t("close_session") : t("advance_stage")}
            </Button>
          )}
        </div>
      </div>

      {allergies && allergies.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md border-l-4 border-l-destructive bg-destructive/5 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">{t("allergies")}</div>
            <div>{allergies.map((a: any) => `${a.allergen} (${t(a.severity)})`).join(", ")}</div>
          </div>
        </div>
      )}

      {softBlock && requiredPending.length > 0 && !isClosed && (
        <div className="flex items-start gap-2 p-3 rounded-md border-l-4 border-l-warning bg-warning/5 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
          <div>
            <div className="font-semibold text-warning">{t("required_pending_warning")}</div>
            <ul className="mt-1 text-xs text-muted-foreground list-disc pl-4">
              {requiredPending.slice(0, 5).map((i: any) => (
                <li key={i.id}>{lang === "vi" && i.checklist_rules?.label_vi ? i.checklist_rules.label_vi : i.checklist_rules?.label}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {(["before", "during", "after"] as const).map((timing) => (
        grouped[timing].length > 0 && (
          <Card key={timing}>
            <CardHeader><CardTitle className="text-base">{t(timing)}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {grouped[timing].map((item: any) => {
                const rule = item.checklist_rules;
                const label = lang === "vi" && rule?.label_vi ? rule.label_vi : rule?.label;
                const allowed = canCheck(rule);
                const StatusIcon = item.status === "done" ? CheckCircle2 : item.status === "exception" ? AlertTriangle : Circle;
                const statusColor = item.status === "done" ? "text-success" : item.status === "exception" ? "text-warning" : "text-muted-foreground";
                const borderClass =
                  item.status === "done" ? "border-l-success" :
                  item.status === "exception" ? "border-l-warning" :
                  rule?.required ? "border-l-destructive/40" : "border-l-border";
                return (
                  <div key={item.id} className={cn("flex items-center justify-between gap-2 p-3 rounded-md border border-l-4 bg-card", borderClass)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox
                        checked={item.status === "done"}
                        onCheckedChange={() => !isClosed && allowed && toggleDone(item)}
                        disabled={isClosed || !allowed}
                      />
                      <StatusIcon className={cn("h-4 w-4 shrink-0", statusColor)} />
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {label} {rule?.required && <span className="text-destructive text-xs">*</span>}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <RoleBadge role={rule?.assigned_role} />
                          <span>{t(rule?.category)}</span>
                          {item.status === "exception" && (
                            <span className="inline-flex items-center gap-1 text-warning">
                              · {t(item.exception_category ?? "reason_other")}: {item.exception_reason}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {!isClosed && item.status !== "exception" && (
                      <Button size="sm" variant="ghost" onClick={() => openException(item)}>
                        <Clock className="h-3.5 w-3.5" /> {t("mark_exception")}
                      </Button>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )
      ))}

      <Sheet open={!!exceptionItem} onOpenChange={(o) => !o && setExceptionItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("mark_exception")}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">{t("reason_category")}</label>
              <Select value={exceptionCategory} onValueChange={setExceptionCategory}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{t(r === "other" ? "reason_other" : r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("reason_details")}</label>
              <Textarea className="mt-1" value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} rows={5} />
            </div>
          </div>
          <SheetFooter>
            <Button variant="ghost" onClick={() => setExceptionItem(null)}>{t("cancel")}</Button>
            <Button onClick={submitException} disabled={!exceptionReason.trim()}>{t("submit")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}