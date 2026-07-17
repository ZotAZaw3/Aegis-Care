import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { CheckCircle2, Clock, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/my-checklist/$id")({
  component: MyChecklistPage,
});

function MyChecklistPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["patient-checklist", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_patient_checklist", { p_session_id: id });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  const head = rows?.[0];
  const tests = (rows ?? []).filter((r) => r.test_name);
  const label = head?.bed_number ? `${t("bed_label")} ${head.bed_number}` : `${t("number_label")} ${head?.session_number ?? "—"}`;

  return (
    <div className="min-h-screen bg-background flex justify-center">
      <div className="w-full max-w-md p-4 space-y-4">
        <div className="pt-4 text-center space-y-1">
          <FlaskConical className="h-8 w-8 mx-auto text-primary" />
          <h1 className="text-xl font-semibold">{t("my_checklist_title")}</h1>
          {head && (
            <div className="text-sm text-muted-foreground">
              {head.patient_name} · {label}
              {head.cycle_number > 1 ? ` · ${t("cycle")} ${head.cycle_number}` : ""}
            </div>
          )}
        </div>

        {!isLoading && !head && (
          <div className="text-center text-sm text-muted-foreground p-6 rounded-lg border bg-card">
            {t("checklist_not_found")}
          </div>
        )}

        {head && tests.length === 0 && (
          <div className="text-center text-sm text-muted-foreground p-6 rounded-lg border bg-card">
            {t("no_lab_orders_yet")}
          </div>
        )}

        {tests.length > 0 && (
          <div className="space-y-2">
            {tests.map((r, i) => {
              const done = r.status === "completed";
              const StatusIcon = done ? CheckCircle2 : Clock;
              return (
                <div
                  key={`${r.test_name}-${i}`}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-lg border bg-card text-base",
                    done ? "border-l-4 border-l-success" : "border-l-4 border-l-warning",
                  )}
                >
                  <StatusIcon className={cn("h-6 w-6 shrink-0", done ? "text-success" : "text-warning")} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.test_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("round")} {r.round_number} · {t(r.status ?? "ordered")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {head && (
          <div className="text-center text-xs text-muted-foreground pt-2">{t("checklist_refresh_hint")}</div>
        )}
      </div>
    </div>
  );
}
