import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/appointments")({
  component: AppointmentsPage,
});

const PROCS = ["extraction", "root_canal", "scaling", "implant", "filling"] as const;

function AppointmentsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: appts } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, scheduled_at, duration_mins, procedure_type, status, patients(full_name), staff!appointments_dentist_id_fkey(full_name), treatment_sessions(id)")
        .order("scheduled_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: patients } = useQuery({
    queryKey: ["patients-list"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name").limit(200)).data ?? [],
  });

  const { data: dentists } = useQuery({
    queryKey: ["dentists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, staff:staff!user_roles_user_id_fkey(id, full_name)")
        .eq("role", "dentist");
      if (error) throw error;
      // shape: pick staff rows
      return (data ?? [])
        .map((r: any) => (Array.isArray(r.staff) ? r.staff[0] : r.staff))
        .filter((s: any): s is { id: string; full_name: string } => !!s);
    },
  });

  const [form, setForm] = useState({
    patient_id: "",
    dentist_id: "",
    procedure_type: "filling",
    scheduled_at: "",
    duration_mins: 30,
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("appointments").insert({
      patient_id: form.patient_id,
      dentist_id: form.dentist_id,
      procedure_type: form.procedure_type as any,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_mins: form.duration_mins,
    });
    if (error) {
      if (error.message.includes("conflict") || (error as any).code === "23514") {
        return toast.error(t("conflict_detected"));
      }
      return toast.error(error.message);
    }
    toast.success(t("saved"));
    setOpen(false);
    setForm({ patient_id: "", dentist_id: "", procedure_type: "filling", scheduled_at: "", duration_mins: 30 });
    qc.invalidateQueries({ queryKey: ["appointments"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("appointments")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>{t("schedule_appointment")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("schedule_appointment")}</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div>
                <Label>{t("patient")}</Label>
                <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {patients?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("dentist_field")}</Label>
                <Select value={form.dentist_id} onValueChange={(v) => setForm({ ...form, dentist_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {dentists?.length ? dentists.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)
                      : <div className="p-2 text-xs text-muted-foreground">{t("no_dentists")}</div>}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("procedure_type")}</Label>
                <Select value={form.procedure_type} onValueChange={(v) => setForm({ ...form, procedure_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROCS.map((p) => <SelectItem key={p} value={p}>{t(p as any)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("scheduled_at")}</Label><Input type="datetime-local" required value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
                <div><Label>{t("duration_mins")}</Label><Input type="number" min={5} value={form.duration_mins} onChange={(e) => setForm({ ...form, duration_mins: Number(e.target.value) })} /></div>
              </div>
              <Button type="submit" className="w-full" disabled={!form.patient_id || !form.dentist_id}>{t("save")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("appointments")}</CardTitle></CardHeader>
        <CardContent className="p-0 divide-y">
          {!appts || appts.length === 0 ? (
            <div className="p-6 text-muted-foreground text-sm">{t("no_data")}</div>
          ) : appts.map((a: any) => {
            const patient = Array.isArray(a.patients) ? a.patients[0] : a.patients;
            const dentist = Array.isArray(a.staff) ? a.staff[0] : a.staff;
            const session = Array.isArray(a.treatment_sessions) ? a.treatment_sessions[0] : a.treatment_sessions;
            return (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <div className="font-medium">{patient?.full_name ?? "—"} <span className="text-muted-foreground font-normal">· {t(a.procedure_type)}</span></div>
                  <div className="text-xs text-muted-foreground">{new Date(a.scheduled_at).toLocaleString()} · {dentist?.full_name ?? "—"}</div>
                </div>
                {session && (
                  <Link to="/sessions/$id" params={{ id: session.id }}>
                    <Button size="sm" variant="outline">{t("open_session")}</Button>
                  </Link>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}