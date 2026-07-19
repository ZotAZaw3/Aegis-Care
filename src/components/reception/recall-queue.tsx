import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ordersDb, currentStaffId, type ActiveOrder } from "@/lib/orders";
import { uploadEvidence } from "@/lib/evidence";

interface RecallOrder extends ActiveOrder {
  patients?: { full_name: string } | { full_name: string }[] | null;
}

const RECALL_KEY = ["recall-queue"];
const PAGE_SIZE = 20;

export function RecallQueue() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery<{ rows: RecallOrder[]; total: number }>({
    queryKey: [...RECALL_KEY, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const { data, count, error } = await ordersDb
        .from("medical_orders")
        .select("*, patients(full_name)", { count: "exact" })
        .eq("order_type", "follow_up")
        .in("status", ["open", "routed", "in_progress"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data as RecallOrder[]) ?? [], total: count ?? 0 };
    },
  });
  const orders = data?.rows;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    const ch = supabase
      .channel("recall-queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "medical_orders", filter: "order_type=eq.follow_up" }, () => {
        qc.invalidateQueries({ queryKey: RECALL_KEY });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const act = async (id: string, type: "appointment" | "record", okKey: string) => {
    const staffId = user ? await currentStaffId(user.id) : undefined;
    if (!staffId) return toast.error(t("no_staff_profile"));
    setBusy(id);
    try {
      await uploadEvidence(id, null, type, staffId);
      toast.success(t(okKey));
      qc.invalidateQueries({ queryKey: RECALL_KEY });
    } catch (e) {
      // follow_up thuộc phòng Tiếp đón → RLS chặn nếu ngoài phòng (42501).
      const code = (e as { code?: string } | null)?.code;
      if (code === "42501") toast.error(t("not_in_department"));
      else toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneCall className="h-4 w-4 text-muted-foreground" />
          {t("recall_queue")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : !orders || orders.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">{t("no_recall_pending")}</div>
        ) : (
          orders.map((o) => {
            const patient = Array.isArray(o.patients) ? o.patients[0] : o.patients;
            const overdue = o.due_at ? new Date(o.due_at) < new Date() : false;
            return (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{o.title}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {patient?.full_name ?? "—"}
                    {o.due_at && (
                      <Badge variant={overdue ? "destructive" : "outline"} className="text-[10px]">
                        {overdue ? t("overdue") : new Date(o.due_at).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" disabled={busy === o.id} onClick={() => act(o.id, "record", "contacted_logged")}>
                    {t("log_contacted")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => act(o.id, "appointment", "appointment_created")}>
                    <CalendarPlus className="h-3.5 w-3.5" />
                    {t("create_appointment")}
                  </Button>
                </div>
              </div>
            );
          })
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t("page_prev")}</Button>
            <span className="text-sm text-muted-foreground tabular-nums">{t("page_of").replace("{a}", String(page + 1)).replace("{b}", String(totalPages))}</span>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>{t("page_next")}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
