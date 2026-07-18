import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ordersDb, type ActiveOrder } from "@/lib/orders";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "outline",
  routed: "secondary",
  in_progress: "secondary",
  awaiting_review: "default",
  closed: "outline",
  cancelled: "destructive",
};

export function ActiveOrdersList({ sessionId }: { sessionId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data: orders, isLoading } = useQuery<ActiveOrder[]>({
    queryKey: ["active-orders", sessionId],
    queryFn: async () => {
      const { data, error } = await ordersDb
        .from("medical_orders")
        .select("*")
        .eq("visit_session_id", sessionId)
        .order("opened_at", { ascending: true });
      if (error) throw error;
      return (data as ActiveOrder[]) ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`orders-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medical_orders", filter: `visit_session_id=eq.${sessionId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["active-orders", sessionId] });
          qc.invalidateQueries({ queryKey: ["pending-review"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, qc]);

  // Procedure orders whose child consent gate isn't closed yet.
  const consentPending = (o: ActiveOrder) =>
    o.order_type === "procedure" &&
    (orders ?? []).some(
      (c) => c.parent_order_id === o.id && c.order_type === "consent" && c.status !== "closed" && c.status !== "cancelled",
    );

  const topLevel = (orders ?? []).filter((o) => o.order_type !== "consent");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          {t("active_orders")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : topLevel.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">{t("no_active_orders")}</div>
        ) : (
          topLevel.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-2 rounded-md border p-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{o.title}</div>
                <Badge variant="outline" className="mt-0.5 text-[10px]">{t(o.order_type)}</Badge>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={statusVariant[o.status] ?? "outline"} className="text-[10px]">
                  {t(o.status)}
                </Badge>
                {consentPending(o) && (
                  <Badge variant="secondary" className="text-[10px] text-warning">
                    {t("awaiting_consent")}
                  </Badge>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
