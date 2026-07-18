// Lịch sử xét nghiệm ở hồ sơ BN — get_observation_history (bổ sung SafetyPanel latest).
// Trình bày SỰ THẬT: value + đơn vị + ngày + tham chiếu KB. KHÔNG phán bất thường.
import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { ordersDb } from "@/lib/orders";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Obs {
  loinc_code: string; label_vi: string | null; value_num: number | null; value_text: string | null;
  unit: string | null; observed_at: string | null; ref_low: number | null; ref_high: number | null;
}

export function LabsHistory({ patientId }: { patientId: string }) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery<Obs[]>({
    queryKey: ["obs-history", patientId],
    queryFn: async () => {
      const { data, error } = await ordersDb.rpc("get_observation_history", { p_patient_id: patientId });
      if (error) throw error;
      return (data as Obs[]) ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          {t("lab_results")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 divide-y">
        {isLoading ? (
          <div className="p-4"><Skeleton className="h-8 w-full" /></div>
        ) : !data || data.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{t("no_records")}</div>
        ) : (
          data.slice(0, 50).map((o, i) => (
            <div key={i} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{o.label_vi ?? o.loinc_code}</span>{" "}
                <span className="tabular-nums">{o.value_num ?? o.value_text}{o.unit ? ` ${o.unit}` : ""}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {o.observed_at ? new Date(o.observed_at).toLocaleDateString() : ""}
                {o.ref_low != null && o.ref_high != null ? ` · ${t("lab_ref")} ${o.ref_low}–${o.ref_high}` : ""}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
