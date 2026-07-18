import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Pill, Activity, ShieldAlert, FlaskConical } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ordersDb, type SafetyPanel, type ObservationFact } from "@/lib/orders";

function isSevere(s: string | null) {
  return s ? ["severe", "high", "critical"].includes(s.toLowerCase()) : false;
}

// Trình bày SỰ THẬT: value + đơn vị (+ngày, +tham chiếu KB). KHÔNG phán bất thường, KHÔNG cờ H/L.
function fmtValue(o: ObservationFact) {
  const v = o.value_num != null ? String(o.value_num) : (o.value_text ?? "—");
  return o.unit ? `${v} ${o.unit}` : v;
}
function fmtRef(refWord: string, lo: number | null, hi: number | null) {
  if (lo != null && hi != null) return `${refWord} ${lo}–${hi}`;
  if (hi != null) return `${refWord} ≤ ${hi}`;
  if (lo != null) return `${refWord} ≥ ${lo}`;
  return "";
}

function Group({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive/80">
        {icon}
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-xs text-muted-foreground italic">{label}</div>;
}

export function SafetyPanel({ patientId }: { patientId: string }) {
  const { t, lang } = useI18n();

  const { data, isLoading } = useQuery<SafetyPanel>({
    queryKey: ["safety-panel", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await ordersDb.rpc("get_safety_panel", { p_patient_id: patientId });
      if (error) throw error;
      return (data as SafetyPanel) ?? { allergies: [], medications: [], systemic_flags: [], observations: [] };
    },
  });

  const none = t("no_records");

  return (
    <section
      aria-label={t("safety_panel")}
      className="rounded-lg border-2 border-destructive/40 bg-destructive/5 p-4 shadow-sm"
    >
      <header className="mb-3 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-destructive" />
        <h2 className="text-sm font-bold text-destructive">{t("safety_panel")}</h2>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : (
        <div className="space-y-4">
          <Group icon={<AlertTriangle className="h-3.5 w-3.5" />} title={t("allergies")}>
            {data && data.allergies.length > 0 ? (
              data.allergies.map((a, i) => (
                <div
                  key={`${a.label}-${i}`}
                  className={cn(
                    "flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-sm",
                    isSevere(a.severity)
                      ? "bg-destructive text-destructive-foreground font-semibold"
                      : "bg-background border border-border",
                  )}
                >
                  <span className="min-w-0">
                    <span className="break-words">{a.label}</span>
                    {a.note && <span className="block text-xs opacity-80">{a.note}</span>}
                  </span>
                  {a.severity && (
                    <span className="shrink-0 text-[11px] uppercase">{t(a.severity)}</span>
                  )}
                </div>
              ))
            ) : (
              <Empty label={none} />
            )}
          </Group>

          <Group icon={<Pill className="h-3.5 w-3.5" />} title={t("medications")}>
            {data && data.medications.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {data.medications.map((m, i) => (
                  <li
                    key={`${m.name}-${i}`}
                    className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs"
                  >
                    {m.name}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty label={none} />
            )}
          </Group>

          <Group icon={<Activity className="h-3.5 w-3.5" />} title={t("systemic_flags")}>
            {data && data.systemic_flags.length > 0 ? (
              data.systemic_flags.map((f, i) => {
                const high = isSevere(f.severity_hint);
                return (
                  <div
                    key={`${f.label}-${i}`}
                    className={cn(
                      "rounded-md border-l-4 px-2 py-1 text-sm",
                      high
                        ? "border-l-destructive bg-destructive/10 font-medium"
                        : "border-l-warning bg-warning/10",
                    )}
                  >
                    {lang === "vi" && f.label_vi ? f.label_vi : f.label}
                  </div>
                );
              })
            ) : (
              <Empty label={none} />
            )}
          </Group>

          {data && data.observations.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FlaskConical className="h-3.5 w-3.5" />
                {t("lab_results")}
              </div>
              <div className="space-y-1">
                {data.observations.map((o) => (
                  <div
                    key={o.loinc_code}
                    className="flex items-start justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{o.label_vi ?? o.loinc_code}</span>{" "}
                      <span className="tabular-nums">{fmtValue(o)}</span>
                      {o.relevance_vi && (
                        <span className="block text-[11px] text-muted-foreground">{o.relevance_vi}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                      {o.observed_at && <span className="block tabular-nums">{o.observed_at}</span>}
                      {fmtRef(t("lab_ref"), o.ref_low, o.ref_high) && (
                        <span className="block">{fmtRef(t("lab_ref"), o.ref_low, o.ref_high)}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
