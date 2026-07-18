import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine, FileSignature, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ordersDb,
  insertSignedOrders,
  PROCEDURE_TYPES,
  type OrderDraft,
  type DraftDecision,
} from "@/lib/orders";
import { getFreshToken } from "@/lib/session-token";
import { ExceptionDialog } from "./exception-dialog";
import { ComplianceJudgeDialog, type JudgePayload } from "./compliance-judge-dialog";
import { CustomOrderForm } from "./custom-order-form";

interface Props {
  sessionId: string;
  patientId: string;
  staffId: string | undefined;
}

type DecisionMap = Record<string, { keep: boolean; reason?: string }>;

export function OrderDraftPanel({ sessionId, patientId, staffId }: Props) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [proc, setProc] = useState<string>("");
  const [customOrders, setCustomOrders] = useState<OrderDraft[]>([]);
  const [decisions, setDecisions] = useState<DecisionMap>({});
  const [exceptionDraft, setExceptionDraft] = useState<OrderDraft | null>(null);
  const [signing, setSigning] = useState(false);
  const [judging, setJudging] = useState(false);
  const [judgeResult, setJudgeResult] = useState<JudgePayload | null>(null);

  const { data: drafts, isLoading } = useQuery<OrderDraft[]>({
    queryKey: ["order-drafts", proc],
    enabled: !!proc,
    queryFn: async () => {
      const { data, error } = await ordersDb.rpc("get_order_drafts", { p_procedure_type: proc });
      if (error) throw error;
      const list = (data as OrderDraft[]) ?? [];
      return [...list].sort((a, b) => a.sort_order - b.sort_order);
    },
  });

  // Nháp KB + y lệnh tùy ý → ký chung qua Compliance Judge.
  const allDrafts = useMemo(() => [...(drafts ?? []), ...customOrders], [drafts, customOrders]);
  const decisionFor = (d: OrderDraft) => decisions[d.id] ?? { keep: true };

  const toggleKeep = (d: OrderDraft, keep: boolean) => {
    if (!keep && d.mandatory) {
      setExceptionDraft(d); // must justify dropping a mandatory step
      return;
    }
    setDecisions((s) => ({ ...s, [d.id]: { keep } }));
  };

  const confirmException = (draftId: string, reason: string) => {
    setDecisions((s) => ({ ...s, [draftId]: { keep: false, reason } }));
    setExceptionDraft(null);
  };

  const addCustom = (d: OrderDraft) => setCustomOrders((s) => [...s, d]);

  const decisionList: DraftDecision[] = useMemo(
    () => allDrafts.map((draft) => {
      const dec = decisions[draft.id] ?? { keep: true };
      return { draft, keep: dec.keep, exceptionReason: dec.reason };
    }),
    [allDrafts, decisions],
  );

  // Bước 1: gọi Compliance Judge trước khi ký (không đường vòng).
  const runJudge = async () => {
    if (!staffId) { toast.error(t("no_staff_profile")); return; }
    if (allDrafts.length === 0) return;
    setJudging(true);
    try {
      const token = await getFreshToken();
      if (!token) { toast.error(t("copilot_error_auth")); return; }
      const res = await fetch("/api/compliance-judge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patient_id: patientId,
          visit_session_id: sessionId,
          procedure_type: proc,
          decisions: decisionList.map((d) => ({ rule_id: d.draft.id, keep: d.keep, reason: d.exceptionReason })),
        }),
      });
      const payload = (await res.json().catch(() => null)) as JudgePayload | null;
      if (!res.ok || !payload) { toast.error(t("judge_error")); return; }
      setJudgeResult(payload);
    } catch {
      toast.error(t("judge_error"));
    } finally {
      setJudging(false);
    }
  };

  // Bước 2: bác sĩ xác nhận trong dialog → lưu ack + ký thật.
  const confirmSign = async (ackReasons: Record<string, string>) => {
    if (!staffId) return;
    setSigning(true);
    try {
      const token = await getFreshToken();
      if (token && judgeResult?.judgment_id) {
        await fetch("/api/compliance-judge", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "ack", judgment_id: judgeResult.judgment_id, ack_reasons: ackReasons }),
        });
      }
      await insertSignedOrders({ sessionId, patientId, procedureType: proc, decisions: decisionList, staffId });
      toast.success(t("orders_signed"));
      setProc("");
      setDecisions({});
      setCustomOrders([]);
      setJudgeResult(null);
      qc.invalidateQueries({ queryKey: ["active-orders", sessionId] });
      qc.invalidateQueries({ queryKey: ["pending-review"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setSigning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PenLine className="h-4 w-4 text-primary" />
          {t("order_draft")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={proc} onValueChange={(v) => { setProc(v); setDecisions({}); setCustomOrders([]); }}>
          <SelectTrigger aria-label={t("procedure_type")}>
            <SelectValue placeholder={t("select_procedure")} />
          </SelectTrigger>
          <SelectContent>
            {PROCEDURE_TYPES.map((p) => (
              <SelectItem key={p} value={p}>{t(p)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!proc ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t("select_procedure_hint")}</div>
        ) : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <>
            {allDrafts.length > 0 && (
            <ul className="space-y-2">
              {allDrafts.map((d) => {
                const dec = decisionFor(d);
                const title = lang === "vi" && d.title_vi ? d.title_vi : d.title;
                return (
                  <li
                    key={d.id}
                    className={cn(
                      "flex items-start gap-3 rounded-md border p-3 transition-colors",
                      dec.keep ? "bg-card" : "bg-muted/40 opacity-70",
                    )}
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={dec.keep}
                      onCheckedChange={(v) => toggleKeep(d, !!v)}
                      aria-label={title}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("text-sm font-medium", !dec.keep && "line-through")}>{title}</span>
                        <Badge variant="outline" className="text-[10px]">{t(d.order_type)}</Badge>
                        {d.is_custom && (
                          <Badge variant="secondary" className="text-[10px]">{t("custom_badge")}</Badge>
                        )}
                        {d.mandatory && (
                          <Badge variant="destructive" className="text-[10px]">{t("mandatory")}</Badge>
                        )}
                        {d.requires_consent && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <ShieldCheck className="h-3 w-3" />
                            {t("requires_consent")}
                          </Badge>
                        )}
                      </div>
                      {d.detail && <p className="mt-0.5 text-xs text-muted-foreground">{d.detail}</p>}
                      {!dec.keep && dec.reason && (
                        <p className="mt-1 text-xs text-warning">{t("exception_reason")}: {dec.reason}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            )}
            <CustomOrderForm onAdd={addCustom} />
            {allDrafts.length > 0 && (
              <Button className="w-full" onClick={runJudge} disabled={judging}>
                {judging ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                {judging ? t("judge_running") : t("sign_orders")}
              </Button>
            )}
          </>
        )}
      </CardContent>

      <ExceptionDialog
        draft={exceptionDraft}
        onClose={() => setExceptionDraft(null)}
        onConfirm={confirmException}
      />

      <ComplianceJudgeDialog
        result={judgeResult}
        signing={signing}
        onConfirm={confirmSign}
        onCancel={() => setJudgeResult(null)}
      />
    </Card>
  );
}
