// Lịch sử xét nghiệm ở hồ sơ BN — get_observation_history_page (bổ sung SafetyPanel latest).
// Trình bày SỰ THẬT: value + đơn vị + ngày + tham chiếu KB. KHÔNG phán bất thường.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { ordersDb } from "@/lib/orders";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Obs {
  loinc_code: string; label_vi: string | null; value_num: number | null; value_text: string | null;
  unit: string | null; observed_at: string | null; ref_low: number | null; ref_high: number | null;
}

const PAGE_SIZE = 20;

export function LabsHistory({ patientId }: { patientId: string }) {
  const { t } = useI18n();
  const [page, setPage] = useState(0);
  const { data, isLoading } = useQuery<{ rows: Obs[]; total: number }>({
    queryKey: ["obs-history", patientId, page],
    queryFn: async () => {
      const { data, error } = await ordersDb.rpc("get_observation_history_page", {
        p_patient_id: patientId,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      const result = data as { rows: Obs[]; total: number } | null;
      return { rows: result?.rows ?? [], total: result?.total ?? 0 };
    },
  });
  const rows = data?.rows;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        ) : !rows || rows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{t("no_records")}</div>
        ) : (
          rows.map((o, i) => (
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
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 p-3">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t("page_prev")}</Button>
            <span className="text-sm text-muted-foreground tabular-nums">{t("page_of").replace("{a}", String(page + 1)).replace("{b}", String(totalPages))}</span>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>{t("page_next")}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
