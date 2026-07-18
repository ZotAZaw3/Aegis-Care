import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentStaffId } from "@/lib/orders";

export function FinalizeList() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: sessions } = useQuery({
    queryKey: ["finalize-sessions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_sessions")
        .select("id, session_number, bed_number, cycle_number, root_session_id, diagnosis, treatment_plan, patients(id, full_name)")
        .eq("status", "finalizing")
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const resolve = async (s: any, transfer: boolean) => {
    if (transfer) {
      const staffId = user ? await currentStaffId(user.id) : undefined;
      await supabase.from("visit_sessions").update({ status: "transferred" }).eq("id", s.id);
      const { error } = await supabase.from("visit_sessions").insert({
        patient_id: (Array.isArray(s.patients) ? s.patients[0] : s.patients)?.id,
        root_session_id: s.root_session_id ?? s.id,
        cycle_number: (s.cycle_number ?? 1) + 1,
        chief_complaint: s.diagnosis,
        created_by: staffId ?? null,
      });
      if (error) return toast.error(error.message);
      toast.success(t("start_new_cycle"));
    } else {
      await supabase.from("visit_sessions").update({ status: "done", closed_at: new Date().toISOString() }).eq("id", s.id);
      toast.success(t("mark_done_visit"));
    }
    qc.invalidateQueries({ queryKey: ["finalize-sessions"] });
    qc.invalidateQueries({ queryKey: ["reception-queue"] });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("finalize_tab")}</CardTitle></CardHeader>
      <CardContent className="p-0 divide-y">
        {!sessions || sessions.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{t("finalize_empty")}</div>
        ) : sessions.map((s: any) => {
          const patient = Array.isArray(s.patients) ? s.patients[0] : s.patients;
          return (
            <div key={s.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Link to="/visits/$id" params={{ id: s.id }} className="font-medium hover:text-primary">{patient?.full_name ?? "—"}</Link>
                  <span className="text-muted-foreground text-xs"> · {s.bed_number ? `${t("bed_label")} ${s.bed_number}` : `${t("number_label")} ${s.session_number}`}</span>
                </div>
              </div>
              {s.diagnosis && <div className="text-xs text-muted-foreground">{t("diagnosis")}: {s.diagnosis}</div>}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("transfer_inpatient_question")}</span>
                <Button size="sm" variant="outline" onClick={() => resolve(s, true)}>{t("yes")}</Button>
                <Button size="sm" onClick={() => resolve(s, false)}>{t("no")}</Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
