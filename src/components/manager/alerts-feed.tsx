import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { ordersDb } from "@/lib/orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Alert {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  session_id: string | null;
  created_at: string;
}

const BORDER: Record<Alert["severity"], string> = {
  critical: "border-l-destructive",
  warning: "border-l-warning",
  info: "border-l-primary",
};

export function AlertsFeed() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading } = useQuery<Alert[]>({
    queryKey: ["alerts-feed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id, severity, message, session_id, created_at")
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as Alert[]) ?? [];
    },
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await ordersDb.rpc("refresh_alerts");
      if (error) throw error;
      const created = typeof data === "number" ? data : 0;
      toast.success(`${created} ${t("new_alerts")}`);
      qc.invalidateQueries({ queryKey: ["alerts-feed"] });
      qc.invalidateQueries({ queryKey: ["alerts-bell"] });
    } catch {
      toast.error(t("error"));
    } finally {
      setRefreshing(false);
    }
  };

  const dismiss = async (id: string) => {
    await supabase.from("alerts").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["alerts-feed"] });
    qc.invalidateQueries({ queryKey: ["alerts-bell"] });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {t("alerts")}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {t("refresh")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></>
        ) : (data ?? []).length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("no_alerts")}</div>
        ) : (
          (data ?? []).map((a) => (
            <div
              key={a.id}
              className={cn("flex items-start gap-2 rounded-md border border-l-4 bg-card p-2.5", BORDER[a.severity])}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm">{a.message}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
              </div>
              {a.session_id && (
                <Link to="/visits/$id" params={{ id: a.session_id }} className="text-xs text-primary hover:underline">
                  {t("view")}
                </Link>
              )}
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => dismiss(a.id)}
              >
                {t("dismiss")}
              </button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
