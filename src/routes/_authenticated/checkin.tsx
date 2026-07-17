import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/checkin")({
  component: CheckinPage,
});

async function currentStaffId(userId: string) {
  const res = await supabase.from("staff").select("id").eq("user_id", userId).single();
  return res.data?.id as string | undefined;
}

function CheckinPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"checkin" | "finalize">("checkin");

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold flex-1">{t("check_in")}</h1>
        <div className="inline-flex rounded-md border p-0.5">
          <button
            className={cn("px-3 py-1.5 text-sm rounded", tab === "checkin" && "bg-primary text-primary-foreground")}
            onClick={() => setTab("checkin")}
          >
            {t("checkin_tab")}
          </button>
          <button
            className={cn("px-3 py-1.5 text-sm rounded", tab === "finalize" && "bg-primary text-primary-foreground")}
            onClick={() => setTab("finalize")}
          >
            {t("finalize_tab")}
          </button>
        </div>
      </div>
      {tab === "checkin" ? <CheckinForm userId={user?.id} qc={qc} /> : <FinalizeList userId={user?.id} qc={qc} />}
    </div>
  );
}

function CheckinForm({ userId, qc }: { userId: string | undefined; qc: ReturnType<typeof useQueryClient> }) {
  const { t } = useI18n();
  const [patientOpen, setPatientOpen] = useState(false);
  const [newPatientOpen, setNewPatientOpen] = useState(false);

  const { data: patients } = useQuery({
    queryKey: ["patients-list"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name").limit(300)).data ?? [],
  });

  const [form, setForm] = useState({ patient_id: "", chief_complaint: "", is_emergency: false, bed_number: "" });
  const [newPatient, setNewPatient] = useState({ full_name: "", dob: "", phone: "" });

  const createPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase
      .from("patients")
      .insert({ full_name: newPatient.full_name, dob: newPatient.dob || null, phone: newPatient.phone || null })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    setForm((f) => ({ ...f, patient_id: data.id }));
    setNewPatient({ full_name: "", dob: "", phone: "" });
    setNewPatientOpen(false);
    qc.invalidateQueries({ queryKey: ["patients-list"] });
  };

  const { data: today } = useQuery({
    queryKey: ["checkin-today"],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("visit_sessions")
        .select("id, session_number, bed_number, is_emergency, status, cycle_number, patients(full_name)")
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const checkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id) return;
    const staffId = userId ? await currentStaffId(userId) : undefined;
    const { data, error } = await supabase
      .from("visit_sessions")
      .insert({
        patient_id: form.patient_id,
        chief_complaint: form.chief_complaint || null,
        is_emergency: form.is_emergency,
        bed_number: form.is_emergency ? form.bed_number || null : null,
        created_by: staffId ?? null,
      })
      .select("session_number, bed_number")
      .single();
    if (error) return toast.error(error.message);
    const label = data.bed_number ? `${t("bed_label")} ${data.bed_number}` : `${t("number_label")} ${data.session_number}`;
    toast.success(`${t("checkin_success")}: ${label}`);
    setForm({ patient_id: "", chief_complaint: "", is_emergency: false, bed_number: "" });
    qc.invalidateQueries({ queryKey: ["checkin-today"] });
    qc.invalidateQueries({ queryKey: ["queue-sessions"] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">{t("checkin_tab")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={checkIn} className="space-y-3">
            <div>
              <Label>{t("patient")}</Label>
              <div className="flex gap-2">
                <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })} open={patientOpen} onOpenChange={setPatientOpen}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {patients?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Dialog open={newPatientOpen} onOpenChange={setNewPatientOpen}>
                  <DialogTrigger asChild><Button type="button" variant="outline">{t("new_patient")}</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{t("new_patient")}</DialogTitle></DialogHeader>
                    <form onSubmit={createPatient} className="space-y-3">
                      <div><Label>{t("full_name")}</Label><Input required value={newPatient.full_name} onChange={(e) => setNewPatient({ ...newPatient, full_name: e.target.value })} /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>{t("dob")}</Label><Input type="date" value={newPatient.dob} onChange={(e) => setNewPatient({ ...newPatient, dob: e.target.value })} /></div>
                        <div><Label>{t("phone")}</Label><Input value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} /></div>
                      </div>
                      <Button type="submit" className="w-full">{t("save")}</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div>
              <Label>{t("chief_complaint")}</Label>
              <Textarea value={form.chief_complaint} onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={form.is_emergency} onCheckedChange={(v) => setForm({ ...form, is_emergency: !!v })} />
              <Label className="cursor-pointer" onClick={() => setForm({ ...form, is_emergency: !form.is_emergency })}>{t("emergency_toggle")}</Label>
            </div>
            {form.is_emergency && (
              <div><Label>{t("bed_number")}</Label><Input required value={form.bed_number} onChange={(e) => setForm({ ...form, bed_number: e.target.value })} placeholder="#2201" /></div>
            )}
            <Button type="submit" className="w-full" disabled={!form.patient_id}>{t("checkin_patient")}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("today_sessions")}</CardTitle></CardHeader>
        <CardContent className="p-0 divide-y">
          {!today || today.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{t("no_data")}</div>
          ) : today.map((s: any) => {
            const patient = Array.isArray(s.patients) ? s.patients[0] : s.patients;
            return (
              <div key={s.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <span className="font-medium">{patient?.full_name ?? "—"}</span>
                  <span className="text-muted-foreground"> · {s.bed_number ? `${t("bed_label")} ${s.bed_number}` : `${t("number_label")} ${s.session_number}`}{s.cycle_number > 1 ? ` · ${t("cycle")} ${s.cycle_number}` : ""}</span>
                </div>
                <span className="text-xs text-muted-foreground">{t(s.status)}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function FinalizeList({ userId, qc }: { userId: string | undefined; qc: ReturnType<typeof useQueryClient> }) {
  const { t } = useI18n();

  const { data: sessions } = useQuery({
    queryKey: ["finalize-sessions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_sessions")
        .select("id, session_number, bed_number, cycle_number, root_session_id, diagnosis, treatment_plan, patients(id, full_name)")
        .eq("status", "finalizing")
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const resolve = async (s: any, transfer: boolean) => {
    if (transfer) {
      const staffId = userId ? await currentStaffId(userId) : undefined;
      await supabase.from("visit_sessions").update({ status: "transferred" }).eq("id", s.id);
      const { error } = await supabase.from("visit_sessions").insert({
        patient_id: (Array.isArray(s.patients) ? s.patients[0] : s.patients)?.id,
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
    qc.invalidateQueries({ queryKey: ["finalize-sessions"] });
    qc.invalidateQueries({ queryKey: ["checkin-today"] });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("finalize_tab")}</CardTitle></CardHeader>
      <CardContent className="p-0 divide-y">
        {!sessions || sessions.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{t("finalize_empty")}</div>
        ) : sessions.map((s: any) => {
          const patient = Array.isArray(s.patients) ? s.patients[0] : s.patients;
          return (
            <div key={s.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Link to="/visits/$id" params={{ id: s.id }} className="font-medium hover:text-primary">{patient?.full_name ?? "—"}</Link>
                  <span className="text-muted-foreground text-xs"> · {s.bed_number ? `${t("bed_label")} ${s.bed_number}` : `${t("number_label")} ${s.session_number}`}</span>
                </div>
              </div>
              {s.diagnosis && <div className="text-xs text-muted-foreground">{t("diagnosis")}: {s.diagnosis}</div>}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("transfer_inpatient_question")}</span>
                <Button size="sm" variant="outline" onClick={() => resolve(s, true)}>{t("yes")}</Button>
                <Button size="sm" onClick={() => resolve(s, false)}>{t("no")}</Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
