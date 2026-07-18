import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/patients/")({ component: PatientsPage });

const PAGE_SIZE = 24;
interface PRow { id: string; full_name: string; dob: string | null; phone: string | null; email: string | null }

function initials(name: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function PatientsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const onSearch = (v: string) => { setSearch(v); setPage(0); };

  const { data, isLoading } = useQuery({
    queryKey: ["patients", search, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      let q = supabase.from("patients").select("id, full_name, dob, phone, email", { count: "exact" })
        .order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (search) q = q.ilike("full_name", `%${search}%`);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as PRow[], total: count ?? 0 };
    },
  });

  const patients = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [form, setForm] = useState({ full_name: "", dob: "", gender: "", phone: "", email: "", contact_prefs: "" });
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("patients").insert({ ...form, dob: form.dob || null });
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
    setForm({ full_name: "", dob: "", gender: "", phone: "", email: "", contact_prefs: "" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["patients"] });
  };

  const columns: Column<PRow>[] = [
    {
      key: "name", header: t("full_name"), sortable: true, sortValue: (r) => r.full_name ?? "",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{initials(r.full_name)}</AvatarFallback></Avatar>
          <span className="font-medium">{r.full_name}</span>
        </div>
      ),
    },
    { key: "dob", header: t("dob"), sortable: true, sortValue: (r) => r.dob ?? "", cell: (r) => <span className="tabular-nums">{r.dob ?? ""}</span> },
    { key: "phone", header: t("phone"), cell: (r) => <span className="tabular-nums">{r.phone ?? ""}</span> },
    { key: "email", header: t("email"), cell: (r) => <span className="text-muted-foreground">{r.email ?? ""}</span>, className: "hidden md:table-cell" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={t("patients")} actions={
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
              <Button type="submit" className="w-full">{t("save")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      } />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input placeholder={t("search_patients")} value={search} onChange={(e) => onSearch(e.target.value)} className="max-w-md" />
        <span className="text-xs text-muted-foreground tabular-nums">{t("total_count").replace("{n}", String(total))}</span>
      </div>

      <DataTable
        columns={columns}
        rows={patients}
        isLoading={isLoading}
        emptyMessage={t("no_data")}
        emptyIcon={<Users className="h-6 w-6" />}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate({ to: "/patients/$id", params: { id: r.id } })}
      />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t("page_prev")}</Button>
          <span className="text-sm text-muted-foreground tabular-nums">{t("page_of").replace("{a}", String(page + 1)).replace("{b}", String(totalPages))}</span>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>{t("page_next")}</Button>
        </div>
      )}
    </div>
  );
}
