import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { OrderDraft } from "@/lib/orders";

interface Props {
  draft: OrderDraft | null;
  onClose: () => void;
  onConfirm: (draftId: string, reason: string) => void;
}

/** Collects the mandatory reason for dropping a KB-mandatory order step. */
export function ExceptionDialog({ draft, onClose, onConfirm }: Props) {
  const { t, lang } = useI18n();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (draft) setReason("");
  }, [draft]);

  const title = draft ? (lang === "vi" && draft.title_vi ? draft.title_vi : draft.title) : "";
  const trimmed = reason.trim();

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("exception_reason")}</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <Label htmlFor="exception-reason">{t("exception_reason_hint")}</Label>
          <Textarea
            id="exception-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!trimmed}
            onClick={() => draft && onConfirm(draft.id, trimmed)}
          >
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
