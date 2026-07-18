import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ordersDb, currentStaffId, type ActiveOrder } from "@/lib/orders";
import { useMyDepartments } from "@/lib/departments";
import { OrderExecuteCard } from "./order-execute-card";

interface ExecOrder extends ActiveOrder {
  patients?: { full_name: string } | { full_name: string }[] | null;
}

const EXEC_KEY = ["exec-orders"];

export function OrderExecutionList() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: myDepts } = useMyDepartments();
  const deptIds = (myDepts ?? []).map((d) => d.id);

  const { data: staffId } = useQuery({
    queryKey: ["current-staff", user?.id],
    enabled: !!user,
    queryFn: () => (user ? currentStaffId(user.id) : Promise.resolve(undefined)),
  });

  // Hàng đợi trạm: order thuộc phòng tôi trực. Loại procedure (dentist ở /clinic), consent (/reception),
  // follow_up (đã có RecallQueue riêng ở /follow-ups) → tránh trùng hàng đợi.
  const { data: orders, isLoading } = useQuery<ExecOrder[]>({
    queryKey: [...EXEC_KEY, deptIds],
    enabled: deptIds.length > 0,
    queryFn: async () => {
      const { data, error } = await ordersDb
        .from("medical_orders")
        .select("*, patients(full_name)")
        .in("department_id", deptIds)
        .not("order_type", "in", "(procedure,consent,follow_up)")
        .in("status", ["open", "routed", "in_progress"])
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data as ExecOrder[]) ?? [];
    },
  });

  useEffect(() => {
    // Không lọc realtime theo department (không filter IN được) → invalidate rộng, query tự lọc lại.
    const invalidate = () => qc.invalidateQueries({ queryKey: EXEC_KEY });
    const ch = supabase
      .channel("exec-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "medical_orders" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_evidence" }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const groups = groupByPatient(orders ?? []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          {t("order_execution")}
        </CardTitle>
        {(myDepts ?? []).length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs text-muted-foreground">{t("dept_queue_label")}:</span>
            {(myDepts ?? []).map((d) => (
              <Badge key={d.id} variant="secondary" className="text-[10px]">{d.name_vi}</Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : groups.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t("no_execution_orders")}</div>
        ) : (
          groups.map(({ name, items }) => (
            <div key={name} className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{name}</div>
              {items.map((o) => (
                <OrderExecuteCard
                  key={o.id}
                  order={o}
                  staffId={staffId}
                  onDone={() => qc.invalidateQueries({ queryKey: EXEC_KEY })}
                />
              ))}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function groupByPatient(orders: ExecOrder[]) {
  const map = new Map<string, { name: string; items: ExecOrder[] }>();
  for (const o of orders) {
    const p = Array.isArray(o.patients) ? o.patients[0] : o.patients;
    const name = p?.full_name ?? "—";
    if (!map.has(o.patient_id)) map.set(o.patient_id, { name, items: [] });
    map.get(o.patient_id)!.items.push(o);
  }
  return Array.from(map.values());
}
