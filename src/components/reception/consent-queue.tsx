import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSignature } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ordersDb } from "@/lib/orders";
import { ConsentForm } from "./consent-form";

interface ConsentOrder {
  id: string;
  title: string;
  patient_id: string;
  parent_order_id: string | null;
  patients?: { full_name: string; dob: string | null } | { full_name: string; dob: string | null }[] | null;
  parent?: { opened_at: string | null } | { opened_at: string | null }[] | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export function ConsentQueue() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [active, setActive] = useState<ConsentOrder | null>(null);

  const { data: orders, isLoading } = useQuery<ConsentOrder[]>({
    queryKey: ["consent-queue"],
    queryFn: async () => {
      const { data, error } = await ordersDb
        .from("medical_orders")
        .select("id, title, patient_id, parent_order_id, patients(full_name, dob), parent:parent_order_id(opened_at)")
        .eq("order_type", "consent")
        .eq("status", "open")
        .order("opened_at", { ascending: true });
      if (error) throw error;
      return (data as ConsentOrder[]) ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("consent-queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "medical_orders", filter: "order_type=eq.consent" }, () => {
        qc.invalidateQueries({ queryKey: ["consent-queue"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="h-4 w-4 text-muted-foreground" />
          {t("consent_queue")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : !orders || orders.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">{t("no_consent_pending")}</div>
        ) : (
          orders.map((o) => {
            const patient = one(o.patients);
            return (
              <div key={o.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{o.title}</div>
                  <div className="text-xs text-muted-foreground">{patient?.full_name ?? "—"}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setActive(o)}>{t("open_consent_form")}</Button>
              </div>
            );
          })
        )}
      </CardContent>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("consent_form")}</DialogTitle></DialogHeader>
          {active && (
            <ConsentForm
              consentOrderId={active.id}
              parentOpenedAt={one(active.parent)?.opened_at ?? null}
              patientDob={one(active.patients)?.dob ?? null}
              onClose={() => setActive(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
