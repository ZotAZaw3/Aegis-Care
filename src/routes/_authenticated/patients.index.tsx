import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import defaultAvatar from "@/assets/patient-avatar-placeholder.jpg";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/patients/")({
  component: PatientsPage,
});

function PatientsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: patients } = useQuery({
    queryKey: ["patients", search],
    queryFn: async () => {
      let q = supabase.from("patients").select("id, full_name, dob, phone, email").order("created_at", { ascending: false }).limit(100);
      if (search) q = q.ilike("full_name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ full_name: "", dob: "", gender: "", phone: "", email: "", contact_prefs: "" });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, dob: form.dob || null };
    const { error } = await supabase.from("patients").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
    setForm({ full_name: "", dob: "", gender: "", phone: "", email: "", contact_prefs: "" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["patients"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("patients")}</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>{t("add_patient")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("add_patient")}</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div><Label>{t("full_name")}</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("dob")}</Label><Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></div>
                <div>
                  <Label>{t("gender")}</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{t("male")}</SelectItem>
                      <SelectItem value="female">{t("female")}</SelectItem>
                      <SelectItem value="other">{t("other")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>{t("phone")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>{t("email")}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>{t("contact_prefs")}</Label><Input value={form.contact_prefs} onChange={(e) => setForm({ ...form, contact_prefs: e.target.value })} /></div>
              <Button type="submit" className="w-full">{t("save")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <Input placeholder={t("search_patients")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
      {!patients || patients.length === 0 ? (
        <Card><CardContent className="p-6 text-muted-foreground text-sm">{t("no_data")}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {patients.map((p) => (
            <Link key={p.id} to="/patients/$id" params={{ id: p.id }}>
              <Card className="gap-2 h-full hover:border-primary transition-colors">
                <CardContent className="p-3 flex flex-col items-center text-center gap-2">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={defaultAvatar} alt="" />
                    <AvatarFallback>{p.full_name?.[0] ?? "?"}</AvatarFallback>
                  </Avatar>
                  <div className="font-medium text-sm truncate w-full">{p.full_name}</div>
                  <div className="text-xs text-muted-foreground truncate w-full">{p.phone || p.email || "—"}</div>
                  <div className="text-xs text-muted-foreground">{p.dob ?? ""}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}