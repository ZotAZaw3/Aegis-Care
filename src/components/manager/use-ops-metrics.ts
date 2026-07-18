// Hook query 2 RPC tất định get_ops_metrics / get_ops_trends (admin-gated ở DB).
// refetchInterval ~30s cho "realtime-ish" (KISS). ordersDb = supabase cast (types.ts cũ).
import { useQuery } from "@tanstack/react-query";
import { ordersDb } from "@/lib/orders";

export interface OpsMetrics {
  generated_at: string;
  period: { from: string; to: string };
  patients: { total: number; visits_today_waiting: number; visits_today_in_exam: number; visits_today_done: number };
  orders: { by_status: Record<string, number>; by_type: Record<string, number>; overdue: number };
  violations: { total: number; by_kind: Record<string, number>; by_role: Record<string, number> };
  judge: { today: number; has_findings: number; unacked: number };
  workload: {
    orders_open_by_role: Record<string, number>;
    pending_review_by_dentist: { dentist: string; count: number }[];
  };
  delta: {
    visits_today: number; visits_yesterday: number;
    orders_closed_today: number; orders_closed_yesterday: number;
    violations_new_today: number; violations_new_yesterday: number;
  };
  highlights: {
    oldest_overdue_order: { title: string; days_overdue: number } | null;
    top_violation_role: { role: string; count: number } | null;
    oldest_unacked_finding: { procedure_type: string | null; days: number } | null;
    top_pending_review_dentist: { dentist: string; count: number } | null;
  };
}

export interface OpsTrendPoint {
  day: string; visits: number; orders_created: number; orders_closed: number; judge_findings: number;
}

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function useOpsMetrics() {
  return useQuery<OpsMetrics>({
    queryKey: ["ops-metrics"],
    queryFn: async () => {
      const { data, error } = await ordersDb.rpc("get_ops_metrics");
      if (error) throw error;
      return data as OpsMetrics;
    },
    refetchInterval: 30_000,
  });
}

export function useOpsTrends(days: number) {
  return useQuery<OpsTrendPoint[]>({
    queryKey: ["ops-trends", days],
    queryFn: async () => {
      const { data, error } = await ordersDb.rpc("get_ops_trends", {
        p_from: isoDay(-(days - 1)),
        p_to: isoDay(0),
      });
      if (error) throw error;
      return (data as OpsTrendPoint[]) ?? [];
    },
    refetchInterval: 60_000,
  });
}
