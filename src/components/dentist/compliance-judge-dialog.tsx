// Modal gác cổng tại điểm ký. hard_findings (chặn mềm: high buộc lý do) + advisories
// (citation chips) + insufficient. Không đường vòng: chỉ ký được qua nút xác nhận ở đây.
import { useMemo, useState } from "react";
import { ShieldAlert, BookOpen, Info, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { JudgeResult, HardFinding } from "@/server/judge/types";

export interface JudgePayload extends JudgeResult {
  judgment_id: string | null;
}

interface Props {
  result: JudgePayload | null;
  signing: boolean;
  onConfirm: (ackReasons: Record<string, string>) => void;
  onCancel: () => void;
}

const needsReason = (f: HardFinding) => f.severity === "high";

export function ComplianceJudgeDialog({ result, signing, onConfirm, onCancel }: Props) {
  const { t } = useI18n();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const highFindings = useMemo(
    () => (result?.hard_findings ?? []).filter(needsReason),
    [result],
  );
  const allAcked = highFindings.every((_, i) => (reasons[`h${i}`] ?? "").trim().length > 0);

  if (!result) return null;
  const clean = result.verdict === "clean";

  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2", clean ? "text-success" : "text-warning")}>
            <ShieldAlert className="h-5 w-5" />
            {clean ? t("judge_clean") : t("judge_title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {clean && <p className="text-muted-foreground">{t("judge_checked_note")}</p>}

          {result.hard_findings.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-destructive">
                {t("judge_hard_findings")}
              </h3>
              {result.hard_findings.map((f, i) => {
                const high = needsReason(f);
                const key = high ? `h${highFindings.indexOf(f)}` : `x${i}`;
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-md border-l-4 px-3 py-2",
                      f.severity === "high" ? "border-l-destructive bg-destructive/10" : "border-l-warning bg-warning/10",
                    )}
                  >
                    <div className="font-medium">{f.message}</div>
                    {high && (
                      <Textarea
                        className="mt-2 min-h-[52px] text-sm"
                        placeholder={t("judge_ack_reason_required")}
                        value={reasons[key] ?? ""}
                        onChange={(e) => setReasons((s) => ({ ...s, [key]: e.target.value }))}
                      />
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {result.advisories.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                {t("judge_advisories")}
              </h3>
              {result.advisories.map((a, i) => (
                <div key={i} className="rounded-md border bg-card px-3 py-2">
                  <div>{a.message}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {a.citations.map((c, j) => (
                      <span key={j} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {c.citation}{c.page ? ` · tr.${c.page}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {result.insufficient.length > 0 && (
            <section className="space-y-1.5">
              {result.insufficient.map((s, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span><span className="font-medium">{s.topic}:</span> {s.note}</span>
                </div>
              ))}
            </section>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={signing}>
            {t("judge_back")}
          </Button>
          <Button
            onClick={() => onConfirm(reasons)}
            disabled={signing || !allAcked}
          >
            {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("judge_confirm_sign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
