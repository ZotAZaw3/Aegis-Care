import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/follow-ups")({
  component: FollowUpsPage,
});

const STATUSES = ["scheduled", "contacted", "completed", "missed"] as const;
const statusPill: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground border-border",
  contacted: "bg-primary/10 text-primary border-primary/30",
  completed: "bg-success/10 text-success border-success/30",
  missed: "bg-destructive/10 text-destructive border-destructive/30",
};

function FollowUpsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  useEffect(() => {
    (supabase.rpc as any)("escalate_overdue_followups").then?.(() => {
      qc.invalidateQueries({ queryKey: ["alerts-bell"] });
    }).catch?.(() => {});
  }, [qc]);

  const { data } = useQuery({
    queryKey: ["follow-ups"],
    queryFn: async () => {
      const { data } = await supabase
        .from("follow_ups")
        .select("id, session_id, followup_type, due_date, status, visit_sessions(id, procedure_type, patients(full_name), staff!visit_sessions_assigned_dentist_id_fkey(full_name))")
        .order("due_date", { ascending: true });
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("follow-ups-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "follow_ups" }, () => {
        qc.invalidateQueries({ queryKey: ["follow-ups"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const setStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "completed" || status === "contacted") patch.handled_at = new Date().toISOString();
    await supabase.from("follow_ups").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey: ["follow-ups"] });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl">{t("follow_up_queue")}</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">{t("follow_ups")}</CardTitle></CardHeader>
        <CardContent>
          {(data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("no_data")}</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase text-left">
                  <tr>
                    <th className="py-2 pr-3">{t("patient")}</th>
                    <th className="py-2 pr-3">{t("procedure")}</th>
                    <th className="py-2 pr-3">{t("dentist_field")}</th>
                    <th className="py-2 pr-3">{t("followup_type")}</th>
                    <th className="py-2 pr-3">{t("due_date")}</th>
                    <th className="py-2 pr-3">{t("status")}</th>
                    <th className="py-2 pr-3">{t("action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data ?? []).map((f: any) => {
                    const s = Array.isArray(f.visit_sessions) ? f.visit_sessions[0] : f.visit_sessions;
                    const patient = s ? (Array.isArray(s.patients) ? s.patients[0] : s.patients) : null;
                    const dentist = s ? (Array.isArray(s.staff) ? s.staff[0] : s.staff) : null;
                    const overdue = f.status === "scheduled" && new Date(f.due_date) < new Date();
                    return (
                      <tr key={f.id} className="border-t">
                        <td className="py-2 pr-3">
                          <Link to="/visits/$id" params={{ id: f.session_id }} className="hover:text-primary">
                            {patient?.full_name ?? "—"}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">{s?.procedure_type ? t(s.procedure_type) : "—"}</td>
                        <td className="py-2 pr-3">{dentist?.full_name ?? "—"}</td>
                        <td className="py-2 pr-3">{t(f.followup_type)}</td>
                        <td className={cn("py-2 pr-3", overdue && "text-destructive font-medium")}>
                          {new Date(f.due_date).toLocaleDateString()}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={cn("inline-flex items-center px-2 py-0.5 text-xs rounded-full border", statusPill[f.status])}>
                            {t(f.status)}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <Select value={f.status} onValueChange={(v) => setStatus(f.id, v)}>
                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(s)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}