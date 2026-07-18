import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { currentStaffId } from "@/lib/orders";
import { SafetyPanel } from "@/components/dentist/safety-panel";
import { BriefingPanel } from "@/components/dentist/briefing-panel";
import { OrderDraftPanel } from "@/components/dentist/order-draft-panel";
import { ActiveOrdersList } from "@/components/dentist/active-orders-list";
import { PendingReviewQueue } from "@/components/dentist/pending-review-queue";

export const Route = createFileRoute("/_authenticated/visits/$id")({
  component: VisitPage,
});

function VisitPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState<string | undefined>();

  useEffect(() => {
    if (!user) return;
    currentStaffId(user.id).then(setStaffId);
  }, [user?.id]);

  const { data: session } = useQuery({
    queryKey: ["visit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_sessions")
        .select(
          "*, patients(id, full_name, dob, phone), staff!visit_sessions_assigned_dentist_id_fkey(full_name)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const patient: any = session
    ? Array.isArray(session.patients) ? session.patients[0] : session.patients
    : null;

  // Claim a freshly-called visit when the dentist opens it.
  useEffect(() => {
    if (!session || !user || session.status !== "called" || !staffId) return;
    (async () => {
      await supabase
        .from("visit_sessions")
        .update({ status: "in_exam", assigned_dentist_id: staffId })
        .eq("id", id);
      qc.invalidateQueries({ queryKey: ["visit", id] });
    })();
  }, [session?.status, user?.id, staffId]);

  if (!session || !patient) return null;

  const dentist = Array.isArray(session.staff) ? session.staff[0] : session.staff;
  const label = session.bed_number
    ? `${t("bed_label")} ${session.bed_number}`
    : `${t("number_label")} ${session.session_number}`;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{patient.full_name ?? "—"}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {label}
            {dentist?.full_name ? ` · ${dentist.full_name}` : ""}
            {session.chief_complaint ? ` · ${t("chief_complaint")}: ${session.chief_complaint}` : ""}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{t("status")}</div>
          <div className="text-sm font-medium text-foreground">{t(session.status as any)}</div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr] lg:items-start">
        {/* LEFT — read-only context: safety (immutable) + briefing */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
          <SafetyPanel patientId={patient.id} />
          <BriefingPanel patientId={patient.id} />
        </aside>

        {/* RIGHT — order drafting (write) */}
        <div className="space-y-4">
          <OrderDraftPanel sessionId={id} patientId={patient.id} staffId={staffId} />
          <ActiveOrdersList sessionId={id} />
          <PendingReviewQueue staffId={staffId} />
        </div>
      </div>
    </div>
  );
}
