// Bảng lab tech: lab_orders cần làm (ordered/in_progress) + filter + nút hoàn tất → dialog nhập KQ.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Search } from "lucide-react";
import { ordersDb } from "@/lib/orders";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { LabCompleteDialog, type LabRow } from "./lab-complete-dialog";

interface Row extends LabRow { status: string; round_number: number; patient_name: string }

export function LabBoard() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [active, setActive] = useState<LabRow | null>(null);
  const [open, setOpen] = useState(false);

  const { data: rows, isLoading } = useQuery<Row[]>({
    queryKey: ["lab-board"],
    queryFn: async () => {
      const { data, error } = await ordersDb
        .from("lab_orders")
        .select("id, test_name, status, round_number, created_at, visit_sessions(patients(full_name))")
        .in("status", ["ordered", "in_progress"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => {
        const vs = Array.isArray(r.visit_sessions) ? r.visit_sessions[0] : r.visit_sessions;
        const p = vs && (Array.isArray(vs.patients) ? vs.patients[0] : vs.patients);
        return { id: r.id, test_name: r.test_name, status: r.status, round_number: r.round_number, patient_name: p?.full_name ?? "—" };
      });
    },
    refetchInterval: 20000,
  });

  const filtered = (rows ?? []).filter(
    (r) => !q || r.test_name.toLowerCase().includes(q.toLowerCase()) || r.patient_name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="min-h-11 pl-8" placeholder={t("lab_search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? (
        <><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<FlaskConical className="h-6 w-6" />} message={t("lab_empty")} />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{r.test_name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.patient_name} · {t("round")} {r.round_number} · {t(r.status)}
                </div>
              </div>
              <Button size="sm" className="min-h-11 shrink-0" onClick={() => { setActive(r); setOpen(true); }}>
                {t("lab_complete_confirm")}
              </Button>
            </div>
          ))}
        </div>
      )}
      <LabCompleteDialog order={active} open={open} onOpenChange={setOpen} />
    </div>
  );
}
