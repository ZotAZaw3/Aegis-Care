import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lab")({
  component: LabPage,
});

function LabPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [completing, setCompleting] = useState<any | null>(null);
  const [resultNote, setResultNote] = useState("");

  const { data: orders } = useQuery({
    queryKey: ["lab-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_orders")
        .select("id, test_name, notes, status, round_number, visit_session_id, visit_sessions(session_number, bed_number, patients(full_name))")
        .in("status", ["ordered", "in_progress"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("lab-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_orders" }, () => {
        qc.invalidateQueries({ queryKey: ["lab-orders"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const start = async (id: string) => {
    await supabase.from("lab_orders").update({ status: "in_progress" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["lab-orders"] });
  };

  const openComplete = (o: any) => {
    setCompleting(o);
    setResultNote("");
  };

  const submitComplete = async () => {
    if (!completing) return;
    const staffRes = user ? await supabase.from("staff").select("id").eq("user_id", user.id).single() : null;
    const staffId = staffRes?.data?.id;
    const { error } = await supabase.from("lab_orders").update({
      status: "completed",
      completed_by: staffId ?? null,
      completed_at: new Date().toISOString(),
      result_note: resultNote || null,
    }).eq("id", completing.id);
    if (error) { toast.error(error.message); return; }

    const { count } = await supabase
      .from("lab_orders")
      .select("id", { count: "exact", head: true })
      .eq("visit_session_id", completing.visit_session_id)
      .eq("round_number", completing.round_number)
      .neq("status", "completed");
    if (!count) {
      await supabase
        .from("visit_sessions")
        .update({ status: "waiting_recall", current_round: completing.round_number + 1 })
        .eq("id", completing.visit_session_id)
        .eq("status", "waiting_lab");
    }

    setCompleting(null);
    qc.invalidateQueries({ queryKey: ["lab-orders"] });
    qc.invalidateQueries({ queryKey: ["queue-sessions"] });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold flex items-center gap-2"><FlaskConical className="h-5 w-5" /> {t("lab_board")}</h1>
      <Card>
        <CardHeader><CardTitle>{t("lab_orders")}</CardTitle></CardHeader>
        <CardContent className="p-0 divide-y">
          {!orders || orders.length === 0 ? (
            <div className="p-6 text-muted-foreground text-sm">{t("lab_board_empty")}</div>
          ) : orders.map((o: any) => {
            const s = Array.isArray(o.visit_sessions) ? o.visit_sessions[0] : o.visit_sessions;
            const patient = s ? (Array.isArray(s.patients) ? s.patients[0] : s.patients) : null;
            const label = s?.bed_number ? `${t("bed_label")} ${s.bed_number}` : `${t("number_label")} ${s?.session_number}`;
            return (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <div className="font-medium">{o.test_name} <span className="text-muted-foreground font-normal">· {patient?.full_name ?? "—"}</span></div>
                  <div className="text-xs text-muted-foreground">
                    {label} · {t("round")} {o.round_number} · {t(o.status)}
                  </div>
                  {o.notes && <div className="text-xs text-muted-foreground">{o.notes}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {s && (
                    <Link to="/visits/$id" params={{ id: o.visit_session_id }}>
                      <Button size="sm" variant="ghost">{t("view")}</Button>
                    </Link>
                  )}
                  {o.status === "ordered" && (
                    <Button size="sm" variant="outline" onClick={() => start(o.id)}>{t("start_test")}</Button>
                  )}
                  <Button size="sm" onClick={() => openComplete(o)}>{t("complete_test")}</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Sheet open={!!completing} onOpenChange={(open) => !open && setCompleting(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>{t("complete_test")}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">{t("result_note")}</label>
              <Textarea className="mt-1" value={resultNote} onChange={(e) => setResultNote(e.target.value)} rows={5} />
            </div>
          </div>
          <SheetFooter>
            <Button variant="ghost" onClick={() => setCompleting(null)}>{t("cancel")}</Button>
            <Button onClick={submitComplete}>{t("submit")}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
