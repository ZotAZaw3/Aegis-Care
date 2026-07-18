import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function QueueBoard() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data: sessions } = useQuery({
    queryKey: ["reception-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_sessions")
        .select("id, session_number, bed_number, is_emergency, status, patients(full_name)")
        .in("status", ["pending", "called"])
        .order("session_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("reception-queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["reception-queue"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListOrdered className="h-4 w-4 text-muted-foreground" />
          {t("queue_board")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 divide-y">
        {!sessions || sessions.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{t("queue_empty")}</div>
        ) : sessions.map((s: any) => {
          const patient = Array.isArray(s.patients) ? s.patients[0] : s.patients;
          const label = s.bed_number ? `${t("bed_label")} ${s.bed_number}` : `${t("number_label")} ${s.session_number}`;
          return (
            <div key={s.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <div>
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground"> · {patient?.full_name ?? "—"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {s.is_emergency && <Badge variant="destructive" className="text-[10px]">{t("emergency")}</Badge>}
                <Badge variant={s.status === "called" ? "default" : "outline"} className="text-[10px]">{t(s.status)}</Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
