import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Check } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ordersDb, type PendingReviewOrder } from "@/lib/orders";

interface Props {
  staffId: string | undefined;
}

export function PendingReviewQueue({ staffId }: Props) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data: orders, isLoading } = useQuery<PendingReviewOrder[]>({
    queryKey: ["pending-review", staffId ?? "all"],
    queryFn: async () => {
      let q = ordersDb.from("pending_review_orders").select("*");
      if (staffId) q = q.eq("assigned_dentist_id", staffId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as PendingReviewOrder[]) ?? [];
    },
  });

  const closeOrder = async (id: string) => {
    const { error } = await ordersDb
      .from("medical_orders")
      .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: staffId ?? null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("order_closed"));
    qc.invalidateQueries({ queryKey: ["pending-review"] });
    qc.invalidateQueries({ queryKey: ["active-orders"] });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            {t("pending_review")}
          </span>
          {orders && orders.length > 0 && (
            <Badge variant="default" className="text-[10px]">{orders.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : !orders || orders.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">{t("no_pending_review")}</div>
        ) : (
          orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{o.title}</div>
                <Badge variant="outline" className="mt-0.5 text-[10px]">{t(o.order_type)}</Badge>
              </div>
              <Button size="sm" variant="outline" onClick={() => closeOrder(o.id)}>
                <Check className="h-3.5 w-3.5" />
                {t("close_order")}
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
