import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useI18n();

  const { data: sessions } = useQuery({
    queryKey: ["today-sessions"],
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from("treatment_sessions")
        .select("id, pipeline_status, compliance_score, appointment_id, appointments(scheduled_at, procedure_type, patients(full_name), staff!appointments_dentist_id_fkey(full_name))")
        .gte("appointments.scheduled_at", startOfDay.toISOString())
        .lte("appointments.scheduled_at", endOfDay.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const scoreClass = (s: number | null | undefined) => {
    if (s == null) return "text-muted-foreground";
    if (s >= 90) return "text-success";
    if (s >= 70) return "text-warning";
    return "text-destructive";
  };

  const openSessions = (sessions ?? []).filter((s) => s.pipeline_status !== "closed").length;
  const closedToday = (sessions ?? []).filter((s) => s.pipeline_status === "closed" && s.compliance_score != null);
  const avgCompliance = closedToday.length
    ? Math.round(closedToday.reduce((sum, s) => sum + Number(s.compliance_score ?? 0), 0) / closedToday.length)
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("dashboard")}</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("today_sessions")}</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{openSessions}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("clinic_compliance")}</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-3xl font-semibold ${scoreClass(avgCompliance ?? undefined)}`}>
              {avgCompliance != null ? `${avgCompliance}%` : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t("open_alerts")}</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">0</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("sessions")}</CardTitle></CardHeader>
        <CardContent>
          {!sessions || sessions.length === 0 ? (
            <div className="text-muted-foreground text-sm">{t("no_data")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sessions.map((s) => {
                const appt = Array.isArray(s.appointments) ? s.appointments[0] : s.appointments;
                const patient = appt ? (Array.isArray(appt.patients) ? appt.patients[0] : appt.patients) : null;
                const dentist = appt ? (Array.isArray(appt.staff) ? appt.staff[0] : appt.staff) : null;
                return (
                  <Link key={s.id} to="/sessions/$id" params={{ id: s.id }} className="block">
                    <div className="rounded-lg border bg-card p-3 hover:border-primary transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{patient?.full_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{appt ? t(appt.procedure_type as any) : "—"}</div>
                          <div className="text-xs text-muted-foreground">{dentist?.full_name ?? "—"}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">{t(s.pipeline_status as any)}</div>
                          {s.compliance_score != null && (
                            <div className={`text-sm font-semibold ${scoreClass(Number(s.compliance_score))}`}>
                              {Math.round(Number(s.compliance_score))}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}