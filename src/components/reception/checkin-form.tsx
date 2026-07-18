import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { currentStaffId } from "@/lib/orders";

export function CheckinForm({ onDone }: { onDone?: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newPatientOpen, setNewPatientOpen] = useState(false);

  const { data: patients } = useQuery({
    queryKey: ["patients-list"],
    queryFn: async () => (await supabase.from("patients").select("id, full_name").order("full_name").limit(300)).data ?? [],
  });

  const [form, setForm] = useState({ patient_id: "", chief_complaint: "", is_emergency: false, bed_number: "" });
  const [newPatient, setNewPatient] = useState({ full_name: "", dob: "", gender: "", phone: "" });

  const createPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase
      .from("patients")
      .insert({
        full_name: newPatient.full_name,
        dob: newPatient.dob || null,
        gender: newPatient.gender || null,
        phone: newPatient.phone || null,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    setForm((f) => ({ ...f, patient_id: data.id }));
    setNewPatient({ full_name: "", dob: "", gender: "", phone: "" });
    setNewPatientOpen(false);
    qc.invalidateQueries({ queryKey: ["patients-list"] });
  };

  const checkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id) return;
    const staffId = user ? await currentStaffId(user.id) : undefined;
    const { data, error } = await supabase
      .from("visit_sessions")
      .insert({
        patient_id: form.patient_id,
        chief_complaint: form.chief_complaint || null,
        is_emergency: form.is_emergency,
        bed_number: form.is_emergency ? form.bed_number || null : null,
        status: "pending",
        created_by: staffId ?? null,
      })
      .select("session_number, bed_number")
      .single();
    if (error) return toast.error(error.message);
    const label = data.bed_number ? `${t("bed_label")} ${data.bed_number}` : `${t("number_label")} ${data.session_number}`;
    toast.success(`${t("checkin_success")}: ${label}`);
    setForm({ patient_id: "", chief_complaint: "", is_emergency: false, bed_number: "" });
    qc.invalidateQueries({ queryKey: ["reception-board"] });
    onDone?.();
  };

  return (
    <form onSubmit={checkIn} className="space-y-3">
          <div>
            <Label>{t("patient")}</Label>
            <div className="flex gap-2">
              <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
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
                      <div>
                        <Label>{t("gender")}</Label>
                        <Select value={newPatient.gender} onValueChange={(v) => setNewPatient({ ...newPatient, gender: v })}>
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">{t("male")}</SelectItem>
                            <SelectItem value="female">{t("female")}</SelectItem>
                            <SelectItem value="other">{t("other")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div><Label>{t("phone")}</Label><Input value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} /></div>
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
  );
}
