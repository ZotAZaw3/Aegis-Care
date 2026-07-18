import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Stethoscope, ClipboardList } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ordersDb, type CrmRecall } from "@/lib/orders";

// Deterministic dental record (get_crm_recall RPC) — last dental visit, procedures,
// open follow-ups. Retrieval-only, no LLM; safe on prod without edge functions.
export function DentalRecord({ patientId }: { patientId: string }) {
  const { t } = useI18n();

  const { data, isLoading } = useQuery<CrmRecall>({
    queryKey: ["dental-record", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await ordersDb.rpc("get_crm_recall", { p_patient_id: patientId });
      if (error) throw error;
      return (data as CrmRecall) ?? { last_dental_encounter: null, open_followups: [], dental_procedures: [] };
    },
  });

  const none = t("no_records");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Stethoscope className="h-4 w-4 text-muted-foreground" />
          {t("dental_record")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t("last_dental_visit")}:</span>
              <span className="font-medium">
                {data?.last_dental_encounter
                  ? new Date(data.last_dental_encounter).toLocaleDateString()
                  : none}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ClipboardList className="h-3.5 w-3.5" />
                {t("dental_procedures")}
                {data && data.dental_procedures.length > 0 && (
                  <span className="ml-1 rounded-full bg-accent px-1.5 text-[10px] text-accent-foreground">
                    {data.dental_procedures.length}
                  </span>
                )}
              </div>
              {data && data.dental_procedures.length > 0 ? (
                <ul className="divide-y rounded-md border">
                  {data.dental_procedures.map((p, i) => (
                    <li key={`${p.code}-${i}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                      <span className="min-w-0 truncate">{p.description ?? p.code}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {p.performed_at ? new Date(p.performed_at).toLocaleDateString() : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs italic text-muted-foreground">{none}</div>
              )}
            </div>

            {data && data.open_followups.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-warning">
                  {t("open_followups")}
                </div>
                <ul className="space-y-1">
                  {data.open_followups.map((f) => (
                    <li key={f.id} className="rounded-md border-l-4 border-l-warning bg-warning/10 px-2 py-1 text-sm">
                      {f.title}
                      {f.due_at && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          · {new Date(f.due_at).toLocaleDateString()}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
