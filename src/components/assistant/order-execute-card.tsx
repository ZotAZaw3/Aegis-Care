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
import { useMyDepartments } from "@/lib/departments";
import { useAuth } from "@/lib/auth";

interface Props {
  order: ActiveOrder;
  staffId: string | undefined;
  onDone: () => void;
}

export function OrderExecuteCard({ order, staffId, onDone }: Props) {
  const { t } = useI18n();
  const { roles } = useAuth();
  const { data: myDepts } = useMyDepartments();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const overdue = order.due_at ? new Date(order.due_at) < new Date() : false;
  const evidenceMode = order.close_mode === "evidence";
  const evidenceType = order.evidence_type ?? (evidenceMode ? "file_upload" : "manual_tick");

  // P2: chỉ nhân viên đúng phòng mới đóng (override dentist/admin). Gate cứng ở RLS; đây là guard UX.
  const isOverride = roles.includes("dentist") || roles.includes("admin");
  const canClose =
    isOverride || !order.department_id || (myDepts ?? []).some((d) => d.id === order.department_id);

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
      // RLS chặn (không đúng phòng) → 42501; hiện thông báo rõ thay vì message thô.
      const code = (e as { code?: string } | null)?.code;
      if (code === "42501") toast.error(t("not_in_department"));
      else toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-[300px] shrink-0 space-y-2 rounded-md border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{order.title}</div>
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

      {order.detail && <div className="text-xs text-muted-foreground">{order.detail}</div>}

      {order.completion_criteria_vi && (
        <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
          <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span><span className="font-medium text-foreground">{t("completion_when")}:</span> {order.completion_criteria_vi}</span>
        </div>
      )}

      {!canClose ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-muted-foreground">
          {t("not_in_department")}
        </div>
      ) : evidenceMode ? (
        <div className="space-y-2">
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
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              className="h-8 flex-1 text-xs file:text-xs"
            />
            <Button
              size="sm"
              disabled={busy || !file}
              onClick={() => run(() => uploadEvidence(order.id, file, "file_upload", staffId!, note || undefined), "evidence_submitted")}
            >
              <Paperclip className="h-3.5 w-3.5" />
              {t("mark_done")}
            </Button>
          </div>
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
