import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useCopilot } from "@/components/copilot/copilot-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SafetyPanel } from "@/components/dentist/safety-panel";
import { DentalRecord } from "@/components/patient/dental-record";
import { LabsHistory } from "@/components/patient/labs-history";
import { PatientSummaryDialog } from "@/components/patient/patient-summary-dialog";

export const Route = createFileRoute("/_authenticated/patients/$id")({
  component: PatientDetail,
});

function PatientDetail() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data: patient } = useQuery({
    queryKey: ["patient", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: allergies } = useQuery({
    queryKey: ["allergies", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("patient_allergies").select("*").eq("patient_id", id).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: visits } = useQuery({
    queryKey: ["patient-visits", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_sessions")
        .select("id, created_at, session_number, bed_number, procedure_type, diagnosis, status")
        .eq("patient_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  // Feed the open patient into the global copilot context.
  const { setPatient, clearPatient } = useCopilot();
  useEffect(() => {
    if (!patient?.id) return;
    setPatient(patient.id, patient.full_name ?? "—");
    return () => clearPatient();
  }, [patient?.id, patient?.full_name, setPatient, clearPatient]);

  const [form, setForm] = useState({ allergen: "", severity: "mild" as "mild" | "moderate" | "severe", note: "" });

  const addAllergy = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("patient_allergies").insert({ patient_id: id, ...form });
    if (error) return toast.error(error.message);
    setForm({ allergen: "", severity: "mild", note: "" });
    qc.invalidateQueries({ queryKey: ["allergies", id] });
  };

  const removeAllergy = async (aid: string) => {
    const { error } = await supabase.from("patient_allergies").delete().eq("id", aid);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["allergies", id] });
  };

  const sevClass = (s: string) =>
    s === "severe" ? "bg-destructive text-destructive-foreground" : s === "moderate" ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground";

  if (!patient) return null;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{patient.full_name}</h1>
          <div className="text-sm text-muted-foreground">
            {patient.phone && <span>{t("phone")}: {patient.phone} · </span>}
            {patient.email && <span>{patient.email} · </span>}
            {patient.dob && <span>{t("dob")}: {patient.dob}</span>}
          </div>
        </div>
        <PatientSummaryDialog patientId={id} patientName={patient.full_name ?? "—"} />
      </div>

      {allergies && allergies.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">{t("allergies")}</div>
            <div>{allergies.map((a) => `${a.allergen} (${t(a.severity as any)})`).join(", ")}</div>
          </div>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("tab_overview")}</TabsTrigger>
          <TabsTrigger value="history">{t("visit_history")}</TabsTrigger>
          <TabsTrigger value="allergies">{t("allergies")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <SafetyPanel patientId={id} />
            <DentalRecord patientId={id} />
          </div>
          <LabsHistory patientId={id} />
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle>{t("visit_history")}</CardTitle></CardHeader>
        <CardContent className="p-0 divide-y">
          {!visits || visits.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{t("no_visits")}</div>
          ) : visits.map((v) => (
            <Link key={v.id} to="/visits/$id" params={{ id: v.id }} className="flex items-center justify-between p-3 text-sm hover:bg-accent">
              <div>
                <span className="font-medium">{v.bed_number ? `${t("bed_label")} ${v.bed_number}` : `${t("number_label")} ${v.session_number}`}</span>
                <span className="text-muted-foreground"> · {new Date(v.created_at).toLocaleDateString()}{v.procedure_type ? ` · ${t(v.procedure_type as any)}` : ""}</span>
                {v.diagnosis && <div className="text-xs text-muted-foreground">{v.diagnosis}</div>}
              </div>
              <span className="text-xs text-muted-foreground">{t(v.status as any)}</span>
            </Link>
          ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allergies">
          <Card>
            <CardHeader><CardTitle>{t("allergies")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {allergies?.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 p-2 rounded border">
              <div>
                <span className="font-medium">{a.allergen}</span>{" "}
                <span className={`text-xs px-2 py-0.5 rounded ${sevClass(a.severity)}`}>{t(a.severity as any)}</span>
                {a.note && <div className="text-xs text-muted-foreground">{a.note}</div>}
              </div>
              <Button variant="ghost" size="icon" aria-label={t("delete")} onClick={() => removeAllergy(a.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <form onSubmit={addAllergy} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <div className="md:col-span-2"><Label>{t("allergen")}</Label><Input required value={form.allergen} onChange={(e) => setForm({ ...form, allergen: e.target.value })} /></div>
            <div>
              <Label>{t("severity")}</Label>
              <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mild">{t("mild")}</SelectItem>
                  <SelectItem value="moderate">{t("moderate")}</SelectItem>
                  <SelectItem value="severe">{t("severe")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit">{t("add_allergy")}</Button>
            <div className="md:col-span-4"><Label>{t("note")}</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}