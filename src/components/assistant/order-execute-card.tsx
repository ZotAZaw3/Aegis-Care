import { useState } from "react";
import { Paperclip, FileText, Check, Clock, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { uploadEvidence, markManualDone } from "@/lib/evidence";
import type { ActiveOrder } from "@/lib/orders";

interface Props {
  order: ActiveOrder;
  staffId: string | undefined;
  onDone: () => void;
}

export function OrderExecuteCard({ order, staffId, onDone }: Props) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const overdue = order.due_at ? new Date(order.due_at) < new Date() : false;
  const evidenceMode = order.close_mode === "evidence";
  const evidenceType = order.evidence_type ?? (evidenceMode ? "file_upload" : "manual_tick");

  const run = async (fn: () => Promise<void>, okKey: string) => {
    if (!staffId) return toast.error(t("no_staff_profile"));
    setBusy(true);
    try {
      await fn();
      toast.success(t(okKey));
      setFile(null);
      setNote("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">{order.title}</div>
          {order.detail && <div className="text-xs text-muted-foreground">{order.detail}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant="secondary" className="text-[10px]">{t(`ev_type_${evidenceType}`)}</Badge>
          {order.due_at && (
            <Badge variant={overdue ? "destructive" : "outline"} className="text-[10px]">
              <Clock className="mr-1 h-3 w-3" />
              {overdue ? t("overdue") : new Date(order.due_at).toLocaleDateString()}
            </Badge>
          )}
        </div>
      </div>

      {order.completion_criteria_vi && (
        <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
          <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span><span className="font-medium text-foreground">{t("completion_when")}:</span> {order.completion_criteria_vi}</span>
        </div>
      )}

      {evidenceMode ? (
        <div className="space-y-2">
          <Input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={busy || !file}
            onClick={() => run(() => uploadEvidence(order.id, file, "file_upload", staffId!, note || undefined), "evidence_submitted")}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {t("upload_evidence")}
          </Button>
          <Textarea
            rows={2}
            placeholder={t("record_note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={busy || !note.trim()}
            onClick={() => run(() => uploadEvidence(order.id, null, "record", staffId!, note), "evidence_submitted")}
          >
            <FileText className="h-3.5 w-3.5" />
            {t("attach_record")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            rows={2}
            placeholder={t("note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => run(() => markManualDone(order.id, staffId!, note || undefined), "evidence_submitted")}
          >
            <Check className="h-3.5 w-3.5" />
            {t("mark_done")}
          </Button>
        </div>
      )}
    </div>
  );
}
