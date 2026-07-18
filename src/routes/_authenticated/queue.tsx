import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { OrderExecutionList } from "@/components/assistant/order-execution-list";

export const Route = createFileRoute("/_authenticated/queue")({
  component: QueuePage,
});

function QueuePage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data: sessions } = useQuery({
    queryKey: ["queue-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_sessions")
        .select("id, session_number, bed_number, is_emergency, status, current_round, cycle_number, patients(full_name)")
        .in("status", ["pending", "called", "waiting_recall"])
        .order("session_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["queue-sessions"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const callNumber = async (s: any) => {
    // Order-centric model: gọi số chỉ đổi trạng thái ca; không còn visit_exam_rounds.
    const { error } = await supabase.from("visit_sessions").update({ status: "called" }).eq("id", s.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["queue-sessions"] });
  };

  const normal = (sessions ?? []).filter((s: any) => !s.is_emergency);
  const emergency = (sessions ?? []).filter((s: any) => s.is_emergency);

  const renderRow = (s: any) => {
    const patient = Array.isArray(s.patients) ? s.patients[0] : s.patients;
    const label = s.bed_number ? `${t("bed_label")} ${s.bed_number}` : `${t("number_label")} ${s.session_number}`;
    return (
      <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div>
          <div className="font-medium">{label} <span className="text-muted-foreground font-normal">· {patient?.full_name ?? "—"}</span></div>
          <div className="text-xs text-muted-foreground">
            {t("round")} {s.current_round}{s.cycle_number > 1 ? ` · ${t("cycle")} ${s.cycle_number}` : ""} · {t(s.status)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {s.status !== "called" ? (
            <Button size="sm" onClick={() => callNumber(s)}>
              {s.status === "waiting_recall" ? t("recall_number") : t("call_number")}
            </Button>
          ) : (
            <Link to="/visits/$id" params={{ id: s.id }}>
              <Button size="sm" variant="outline">{t("open_exam")}</Button>
            </Link>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("queue")}</h1>
      <Card>
        <CardHeader><CardTitle>{t("normal_queue")}</CardTitle></CardHeader>
        <CardContent className="p-0 divide-y">
          {normal.length === 0 ? <div className="p-6 text-muted-foreground text-sm">{t("queue_empty")}</div> : normal.map(renderRow)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t("emergency_queue")}</CardTitle></CardHeader>
        <CardContent className="p-0 divide-y">
          {emergency.length === 0 ? <div className="p-6 text-muted-foreground text-sm">{t("queue_empty")}</div> : emergency.map(renderRow)}
        </CardContent>
      </Card>

      <OrderExecutionList />
    </div>
  );
}
