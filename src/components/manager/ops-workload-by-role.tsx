// Khối lượng: y lệnh mở theo vai (BarChart) + pending_review theo bác sĩ (danh sách).
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Users2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useOpsMetrics } from "./use-ops-metrics";

const ROLE_KEY: Record<string, string> = {
  receptionist: "receptionist",
  assistant: "assistant",
  dentist: "dentist",
  admin: "admin_role",
};

export function OpsWorkloadByRole() {
  const { t } = useI18n();
  const { data: m, isLoading } = useOpsMetrics();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const rows = Object.entries(m?.workload.orders_open_by_role ?? {}).map(([role, count]) => ({
    role: t(ROLE_KEY[role] ?? role),
    count,
  }));
  const dentists = m?.workload.pending_review_by_dentist ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users2 className="h-4 w-4 text-muted-foreground" />
          {t("ops_workload_title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!mounted || isLoading || !m ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="role" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name={t("ops_workload_open_orders")} fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t("ops_pending_review_by_dentist")}</div>
              {dentists.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t("ops_none")}</div>
              ) : (
                <div className="space-y-1">
                  {dentists.map((d, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                      <span className="truncate">{d.dentist}</span>
                      <Badge variant="secondary" className="tabular-nums">{d.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
