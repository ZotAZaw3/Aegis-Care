import { useEffect } from "react";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function AlertsBell() {
  const { t } = useI18n();
  const { roles } = useAuth();
  const qc = useQueryClient();

  const { data: alerts } = useQuery({
    queryKey: ["alerts-bell"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alerts")
        .select("*")
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []).filter((a: any) => !a.target_role || roles.includes(a.target_role));
    },
    // No polling here: the realtime subscription below invalidates this
    // query on every insert/update/delete to `alerts`, so a timed refetch
    // on top of that was a redundant GET every 30s for every signed-in user.
  });

  useEffect(() => {
    const ch = supabase
      .channel("alerts-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => {
        qc.invalidateQueries({ queryKey: ["alerts-bell"] });
        qc.invalidateQueries({ queryKey: ["alerts-feed"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const dismiss = async (id: string) => {
    await supabase.from("alerts").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["alerts-bell"] });
    qc.invalidateQueries({ queryKey: ["alerts-feed"] });
  };

  const count = alerts?.length ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold inline-flex items-center justify-center">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="font-semibold text-sm">{t("alerts")}</div>
          <span className="text-xs text-muted-foreground">{count} {t("unread")}</span>
        </div>
        <div className="max-h-96 overflow-auto">
          {count === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">{t("no_alerts")}</div>
          ) : (
            alerts!.map((a: any) => (
              <AlertItem key={a.id} alert={a} onDismiss={() => dismiss(a.id)} />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AlertItem({ alert, onDismiss }: { alert: any; onDismiss: () => void }) {
  const { t } = useI18n();
  const border =
    alert.severity === "critical" ? "border-l-destructive"
      : alert.severity === "warning" ? "border-l-warning"
      : "border-l-primary";
  return (
    <div className={cn("border-l-4 p-3 border-b bg-card flex items-start gap-2", border)}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{alert.message}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {new Date(alert.created_at).toLocaleString()}
        </div>
        {alert.session_id && (
          <Link to="/visits/$id" params={{ id: alert.session_id }} className="text-xs text-primary hover:underline">
            {t("view")} →
          </Link>
        )}
      </div>
      <button onClick={onDismiss} className="text-xs text-muted-foreground hover:text-foreground">{t("dismiss")}</button>
    </div>
  );
}