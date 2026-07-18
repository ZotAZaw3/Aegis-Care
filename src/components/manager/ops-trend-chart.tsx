// Chart xu hướng FLOW theo ngày (recharts). Client-only render (guard SSR TanStack Start).
import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { TrendingUp } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useOpsTrends } from "./use-ops-metrics";

export function OpsTrendChart() {
  const { t } = useI18n();
  const [days, setDays] = useState(14);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data, isLoading } = useOpsTrends(days);

  const rows = (data ?? []).map((d) => ({ ...d, label: d.day.slice(5) })); // MM-DD

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          {t("ops_trend_title")}
        </CardTitle>
        <div className="flex gap-1">
          {[14, 30].map((n) => (
            <Button key={n} size="sm" variant={days === n ? "default" : "outline"} onClick={() => setDays(n)}>
              {n}{t("ops_days_suffix")}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {!mounted || isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="visits" name={t("ops_trend_visits")} stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="orders_created" name={t("ops_trend_orders_created")} stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="orders_closed" name={t("ops_trend_orders_closed")} stroke="#9333ea" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="judge_findings" name={t("ops_trend_findings")} stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
