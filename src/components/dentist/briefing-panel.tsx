import { useQuery } from "@tanstack/react-query";
import { BookOpen, RefreshCw, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Briefing } from "@/lib/orders";

export function BriefingPanel({ patientId }: { patientId: string }) {
  const { t } = useI18n();

  const { data, isLoading, isError, refetch, isFetching } = useQuery<Briefing>({
    queryKey: ["briefing", patientId],
    enabled: !!patientId,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("briefing", {
        body: { patient_id: patientId },
      });
      if (error) throw error;
      return data as Briefing;
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          {t("briefing")}
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label={t("reload")}
        >
          <RefreshCw className={isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : isError ? (
          <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("briefing_unavailable")}
          </div>
        ) : !data || data.summary_sentences.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">{t("no_records")}</div>
        ) : (
          <>
            <ul className="space-y-2">
              {data.summary_sentences.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span>{s.text}</span>
                  {s.encounter_ids.length > 0 && (
                    <span className="mt-0.5 flex shrink-0 flex-wrap gap-1">
                      {s.encounter_ids.map((_, j) => (
                        <span
                          key={j}
                          title={t("citation")}
                          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-semibold text-primary"
                        >
                          {j + 1}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {data.caveats.length > 0 && (
              <ul className="space-y-1 border-t pt-2">
                {data.caveats.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-warning">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            )}
            <div className="text-[11px] text-muted-foreground">
              {t("source_encounters")}: {data.source_encounter_count}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
