import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LayoutList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { ordersDb } from "@/lib/orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const HANGING = ["open", "routed", "in_progress", "awaiting_review"];

interface OpenCase {
  id: string;
  session_number: number | null;
  bed_number: string | null;
  status: string;
  name: string;
  hanging: number;
}

export function OpenCasesBoard() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data: cases, isLoading } = useQuery<OpenCase[]>({
    queryKey: ["open-cases"],
    queryFn: async () => {
      const { data: sessions, error } = await supabase
        .from("visit_sessions")
        .select("id, session_number, bed_number, status, patients(full_name)")
        .not("status", "in", "(done,transferred)")
        .order("session_number", { ascending: true });
      if (error) throw error;
      const rows = sessions ?? [];
      if (rows.length === 0) return [];

      // Count hanging orders per case.
      const { data: orders } = await ordersDb
        .from("medical_orders")
        .select("visit_session_id, status")
        .in("visit_session_id", rows.map((s: any) => s.id))
        .in("status", HANGING);
      const counts: Record<string, number> = {};
      (orders ?? []).forEach((o: any) => {
        counts[o.visit_session_id] = (counts[o.visit_session_id] ?? 0) + 1;
      });

      return rows.map((s: any) => {
        const p = Array.isArray(s.patients) ? s.patients[0] : s.patients;
        return {
          id: s.id,
          session_number: s.session_number,
          bed_number: s.bed_number,
          status: s.status,
          name: p?.full_name ?? "—",
          hanging: counts[s.id] ?? 0,
        };
      });
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("manager-open-cases")
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["open-cases"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutList className="h-4 w-4 text-muted-foreground" />
          {t("open_cases")}
          {!isLoading && (
            <Badge variant="secondary" className="ml-1 tabular-nums">{cases?.length ?? 0}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></>
        ) : (cases ?? []).length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-sm text-muted-foreground">{t("no_open_cases")}</div>
            <div className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{t("no_open_cases_hint")}</div>
          </div>
        ) : (
          (cases ?? []).map((c) => (
            <Link
              key={c.id}
              to="/visits/$id" params={{ id: c.id }}
              className="flex items-center justify-between gap-3 rounded-md border p-2.5 hover:border-primary focus-visible:border-primary focus-visible:outline-none transition-colors"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t("case_label")} #{c.session_number ?? "—"}
                  {c.bed_number && <> · {t("bed_label")} {c.bed_number}</>}
                  {" · "}{t(c.status)}
                </div>
              </div>
              <Badge
                variant={c.hanging > 0 ? "destructive" : "outline"}
                className="shrink-0 tabular-nums whitespace-nowrap"
              >
                {c.hanging} {t("hanging_orders")}
              </Badge>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
