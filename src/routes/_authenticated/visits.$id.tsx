import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Clock, Circle, Search } from "lucide-react";
import { toast } from "sonner";
import { ComplianceRing } from "@/components/compliance-ring";
import { RoleBadge } from "@/components/role-badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/visits/$id")({
  component: VisitPage,
});

const REASONS = ["patient_refusal", "equipment_unavailable", "clinical_contraindication", "other"] as const;
const PROCS = ["extraction", "root_canal", "scaling", "implant", "filling"] as const;

async function currentStaffId(userId: string) {
  const res = await supabase.from("staff").select("id").eq("user_id", userId).single();
  return res.data?.id as string | undefined;
}

function VisitPage() {
  const { id } = Route.useParams();
  const { t, lang } = useI18n();
  const { user, roles } = useAuth();
  const qc = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["visit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_sessions")
        .select("*, patients(id, full_name, dob, phone), staff!visit_sessions_assigned_dentist_id_fkey(full_name)")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const patient: any = session ? (Array.isArray(session.patients) ? session.patients[0] : session.patients) : null;

  // Claim the session when the dentist opens a freshly-called visit.
  useEffect(() => {
    if (!session || !user || session.status !== "called") return;
    (async () => {
      const staffId = await currentStaffId(user.id);
      if (!staffId) return;
      await supabase.from("visit_sessions").update({ status: "in_exam", assigned_dentist_id: staffId }).eq("id", id);
      await supabase.from("visit_exam_rounds").update({ dentist_id: staffId }).eq("visit_session_id", id).eq("round_number", session.current_round);
      qc.invalidateQueries({ queryKey: ["visit", id] });
      qc.invalidateQueries({ queryKey: ["exam-round", id] });
    })();
  }, [session?.status, user?.id]);

  const { data: round } = useQuery({
    queryKey: ["exam-round", id, session?.current_round],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_exam_rounds")
        .select("*")
        .eq("visit_session_id", id)
        .eq("round_number", session!.current_round)
        .maybeSingle();
      return data;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["visit-history", patient?.id, id],
    enabled: !!patient?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_sessions")
        .select("id, created_at, procedure_type, chief_complaint, diagnosis, treatment_plan")
        .eq("patient_id", patient!.id)
        .neq("id", id)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const { data: allergies } = useQuery({
    queryKey: ["visit-allergies", patient?.id],
    enabled: !!patient?.id,
    queryFn: async () => (await supabase.from("patient_allergies").select("*").eq("patient_id", patient!.id)).data ?? [],
  });

  const { data: roundLabOrders } = useQuery({
    queryKey: ["lab-orders-round", id, session?.current_round],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("lab_orders")
        .select("*")
        .eq("visit_session_id", id)
        .eq("round_number", session!.current_round)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const { data: items } = useQuery({
    queryKey: ["checklist", id],
    enabled: !!session?.procedure_type,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_items")
        .select("*, checklist_rules(*)")
        .eq("session_id", id);
      if (error) throw error;
      return (data ?? []).sort((a: any, b: any) => (a.checklist_rules?.sort_order ?? 0) - (b.checklist_rules?.sort_order ?? 0));
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`visit-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders", filter: `visit_session_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["lab-orders-round", id, session?.current_round] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_sessions", filter: `id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["visit", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc, session?.current_round]);

  // ==== Symptom / CRM search ====
  const [symptomKeyword, setSymptomKeyword] = useState("");
  const [symptomResults, setSymptomResults] = useState<any[] | null>(null);
  const toggleCrmLookup = async (checked: boolean) => {
    await supabase.from("visit_exam_rounds").update({ crm_lookup_used: checked }).eq("visit_session_id", id).eq("round_number", session!.current_round);
    qc.invalidateQueries({ queryKey: ["exam-round", id, session?.current_round] });
  };
  const runSymptomSearch = async () => {
    if (!symptomKeyword.trim()) { setSymptomResults(null); return; }
    const kw = `%${symptomKeyword.trim()}%`;
    const [fromSessions, fromRounds] = await Promise.all([
      supabase.from("visit_sessions").select("id, created_at, diagnosis, chief_complaint, patients(full_name)")
        .or(`chief_complaint.ilike.${kw},diagnosis.ilike.${kw}`).neq("id", id).limit(15),
      supabase.from("visit_exam_rounds").select("id, symptoms_note, visit_sessions(id, created_at, patients(full_name))")
        .ilike("symptoms_note", kw).limit(15),
    ]);
    const results = [
      ...((fromSessions.data ?? []).map((s: any) => ({
        id: s.id,
        note: s.diagnosis || s.chief_complaint,
        patient: Array.isArray(s.patients) ? s.patients[0]?.full_name : s.patients?.full_name,
        date: s.created_at,
      }))),
      ...((fromRounds.data ?? []).map((r: any) => {
        const vs = Array.isArray(r.visit_sessions) ? r.visit_sessions[0] : r.visit_sessions;
        return {
          id: vs?.id ?? r.id,
          note: r.symptoms_note,
          patient: vs ? (Array.isArray(vs.patients) ? vs.patients[0]?.full_name : vs.patients?.full_name) : "—",
          date: vs?.created_at,
        };
      })),
    ];
    setSymptomResults(results);
  };

  // ==== Clinical exam note ====
  const [examNote, setExamNote] = useState("");
  useEffect(() => { setExamNote(round?.clinical_exam_note ?? ""); }, [round?.id]);
  const saveExamNote = async () => {
    await supabase.from("visit_exam_rounds").update({ clinical_exam_note: examNote }).eq("visit_session_id", id).eq("round_number", session!.current_round);
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["exam-round", id, session?.current_round] });
  };

  // ==== Lab order ====
  const [needsLab, setNeedsLab] = useState(false);
  const [labForm, setLabForm] = useState({ test_name: "", notes: "" });
  useEffect(() => { setNeedsLab(!!round?.needs_lab); }, [round?.id]);
  const addLabOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const staffId = await currentStaffId(user.id);
    const { error } = await supabase.from("lab_orders").insert({
      visit_session_id: id,
      round_number: session!.current_round,
      ordered_by: staffId ?? null,
      test_name: labForm.test_name,
      notes: labForm.notes || null,
    });
    if (error) return toast.error(error.message);
    await supabase.from("visit_exam_rounds").update({ needs_lab: true }).eq("visit_session_id", id).eq("round_number", session!.current_round);
    await supabase.from("visit_sessions").update({ status: "waiting_lab" }).eq("id", id);
    setLabForm({ test_name: "", notes: "" });
    qc.invalidateQueries({ queryKey: ["lab-orders-round", id, session?.current_round] });
    qc.invalidateQueries({ queryKey: ["visit", id] });
  };

  // ==== Round progression ====
  const recallPatient = async () => {
    await supabase.from("visit_sessions").update({ current_round: (session!.current_round ?? 1) + 1, status: "waiting_recall" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["visit", id] });
  };

  // ==== Finalize ====
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizeForm, setFinalizeForm] = useState({ procedure_type: "filling", diagnosis: "", treatment_plan: "", prescription: "" });
  const submitFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("visit_sessions").update({
      procedure_type: finalizeForm.procedure_type as any,
      diagnosis: finalizeForm.diagnosis,
      treatment_plan: finalizeForm.treatment_plan,
      prescription: finalizeForm.prescription,
      status: "finalizing",
    }).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("visit_exam_rounds").update({ completed_at: new Date().toISOString() }).eq("visit_session_id", id).eq("round_number", session!.current_round);
    setFinalizeOpen(false);
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["visit", id] });
  };

  // ==== Checklist (documentation compliance, post-finalize) ====
  const canCheck = (rule: any) => roles.includes("admin") || roles.includes(rule?.assigned_role);
  const [exceptionItem, setExceptionItem] = useState<any | null>(null);
  const [exceptionCategory, setExceptionCategory] = useState<string>("other");
  const [exceptionReason, setExceptionReason] = useState("");

  const toggleDone = async (item: any) => {
    if (!canCheck(item.checklist_rules)) { toast.error(t("only_role_can_check")); return; }
    const staffId = user ? await currentStaffId(user.id) : undefined;
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
    const staffId = user ? await currentStaffId(user.id) : undefined;
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

  const finishDocumentation = async () => {
    const required = (items ?? []).filter((i: any) => i.checklist_rules?.required);
    const completed = required.filter((i: any) => i.status === "done" || i.status === "exception").length;
    const score = required.length ? Math.round((completed / required.length) * 100) : 100;
    const { error } = await supabase.from("visit_sessions").update({ compliance_score: score }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
    qc.invalidateQueries({ queryKey: ["visit", id] });
  };

  if (!session) return null;

  const label = session.bed_number ? `${t("bed_label")} ${session.bed_number}` : `${t("number_label")} ${session.session_number}`;
  const dentist = Array.isArray(session.staff) ? session.staff[0] : session.staff;
  const inExam = session.status === "in_exam";
  const grouped = { before: [] as any[], during: [] as any[], after: [] as any[] };
  (items ?? []).forEach((it: any) => {
    const timing = it.checklist_rules?.trigger_timing as "before" | "during" | "after";
    if (timing) grouped[timing].push(it);
  });

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{patient?.full_name ?? "—"}</h1>
          <div className="text-sm text-muted-foreground">
            {label} · {t("round")} {session.current_round}
            {session.cycle_number > 1 ? ` · ${t("cycle")} ${session.cycle_number}` : ""}
            {dentist?.full_name ? ` · ${dentist.full_name}` : ""}
          </div>
          {session.chief_complaint && <div className="text-sm text-muted-foreground mt-1">{t("chief_complaint")}: {session.chief_complaint}</div>}
        </div>
        <div className="flex items-center gap-3">
          {session.compliance_score != null && <ComplianceRing value={session.compliance_score as any} size={56} strokeWidth={6} />}
          <div className="text-xs text-muted-foreground">
            <div>{t("status")}</div>
            <div className="text-sm font-medium text-foreground">{t(session.status as any)}</div>
          </div>
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

      <Card>
        <CardHeader><CardTitle className="text-base">{t("crm_history")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!history || history.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("no_visit_history")}</div>
          ) : history.map((h: any) => (
            <div key={h.id} className="text-sm border-l-2 pl-2">
              <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleDateString()} {h.procedure_type ? `· ${t(h.procedure_type)}` : ""}</div>
              {h.chief_complaint && <div>{t("chief_complaint")}: {h.chief_complaint}</div>}
              {h.diagnosis && <div>{t("diagnosis")}: {h.diagnosis}</div>}
            </div>
          ))}
        </CardContent>
      </Card>

      {inExam && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("clinical_exam")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox checked={!!round?.crm_lookup_used} onCheckedChange={(v) => toggleCrmLookup(!!v)} />
              <Label className="cursor-pointer" onClick={() => toggleCrmLookup(!round?.crm_lookup_used)}>{t("unusual_symptoms")}</Label>
            </div>
            {round?.crm_lookup_used && (
              <div className="space-y-2 pl-6">
                <Label>{t("symptom_search")}</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("symptom_search_placeholder")}
                    value={symptomKeyword}
                    onChange={(e) => setSymptomKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runSymptomSearch()}
                  />
                  <Button type="button" variant="outline" onClick={runSymptomSearch}><Search className="h-4 w-4" /></Button>
                </div>
                {symptomResults && (
                  <div className="space-y-1 max-h-48 overflow-auto">
                    {symptomResults.length === 0 ? (
                      <div className="text-xs text-muted-foreground">{t("no_data")}</div>
                    ) : symptomResults.map((r, i) => (
                      <div key={`${r.id}-${i}`} className="text-xs border rounded p-2">
                        <div className="font-medium">{r.patient ?? "—"} <span className="text-muted-foreground font-normal">{r.date ? new Date(r.date).toLocaleDateString() : ""}</span></div>
                        <div className="text-muted-foreground">{r.note}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>{t("clinical_exam_note")}</Label>
              <Textarea value={examNote} onChange={(e) => setExamNote(e.target.value)} onBlur={saveExamNote} rows={3} />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox checked={needsLab} onCheckedChange={(v) => setNeedsLab(!!v)} />
              <Label className="cursor-pointer" onClick={() => setNeedsLab(!needsLab)}>{t("needs_lab")}</Label>
            </div>
            {needsLab && (
              <form onSubmit={addLabOrder} className="pl-6 grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                <div className="md:col-span-1"><Label>{t("test_name")}</Label><Input required value={labForm.test_name} onChange={(e) => setLabForm({ ...labForm, test_name: e.target.value })} /></div>
                <div className="md:col-span-1"><Label>{t("lab_order_notes")}</Label><Input value={labForm.notes} onChange={(e) => setLabForm({ ...labForm, notes: e.target.value })} /></div>
                <Button type="submit">{t("add_lab_order")}</Button>
              </form>
            )}
            {roundLabOrders && roundLabOrders.length > 0 && (
              <div className="pl-6 space-y-1">
                <Label>{t("lab_orders")}</Label>
                {roundLabOrders.map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between text-xs border rounded p-2">
                    <span>{o.test_name}</span>
                    <span className="text-muted-foreground">{t(o.status)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button variant="outline" onClick={recallPatient}>{t("recall_patient")}</Button>
              <Button onClick={() => setFinalizeOpen(true)}>{t("finalize_visit")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {session.status === "waiting_lab" && (
        <div className="flex items-center gap-2 p-3 rounded-md border-l-4 border-l-warning bg-warning/5 text-sm">
          <Clock className="h-4 w-4 text-warning" /> {t("waiting_lab_notice")}
        </div>
      )}

      {session.procedure_type && (
        <>
          {(["before", "during", "after"] as const).map((timing) => (
            grouped[timing].length > 0 && (
              <Card key={timing}>
                <CardHeader><CardTitle className="text-base">{t(timing)}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {grouped[timing].map((item: any) => {
                    const rule = item.checklist_rules;
                    const itemLabel = lang === "vi" && rule?.label_vi ? rule.label_vi : rule?.label;
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
                            onCheckedChange={() => allowed && toggleDone(item)}
                            disabled={!allowed}
                          />
                          <StatusIcon className={cn("h-4 w-4 shrink-0", statusColor)} />
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {itemLabel} {rule?.required && <span className="text-destructive text-xs">*</span>}
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
                        {item.status !== "exception" && (
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
          {session.status === "finalizing" && (
            <Button onClick={finishDocumentation}>{t("save")}</Button>
          )}
        </>
      )}

      <Sheet open={!!exceptionItem} onOpenChange={(o) => !o && setExceptionItem(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>{t("mark_exception")}</SheetTitle></SheetHeader>
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

      <Sheet open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader><SheetTitle>{t("finalize_visit")}</SheetTitle></SheetHeader>
          <form onSubmit={submitFinalize} className="space-y-4 py-4">
            <div>
              <Label>{t("procedure_type")}</Label>
              <Select value={finalizeForm.procedure_type} onValueChange={(v) => setFinalizeForm({ ...finalizeForm, procedure_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROCS.map((p) => <SelectItem key={p} value={p}>{t(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("diagnosis")}</Label>
              <Textarea required value={finalizeForm.diagnosis} onChange={(e) => setFinalizeForm({ ...finalizeForm, diagnosis: e.target.value })} rows={3} />
            </div>
            <div>
              <Label>{t("treatment_plan")}</Label>
              <Textarea required value={finalizeForm.treatment_plan} onChange={(e) => setFinalizeForm({ ...finalizeForm, treatment_plan: e.target.value })} rows={3} />
            </div>
            <div>
              <Label>{t("prescription")}</Label>
              <Textarea value={finalizeForm.prescription} onChange={(e) => setFinalizeForm({ ...finalizeForm, prescription: e.target.value })} rows={3} />
            </div>
            <SheetFooter>
              <Button type="button" variant="ghost" onClick={() => setFinalizeOpen(false)}>{t("cancel")}</Button>
              <Button type="submit">{t("submit_finalize")}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
