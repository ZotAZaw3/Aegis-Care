import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SLOTS = ["08:30", "09:30", "14:00", "15:30"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookingSheet({ open, onOpenChange }: Props) {
  const { t } = useI18n();
  const [slot, setSlot] = useState(SLOTS[0]);

  const submit = () => {
    toast.info(t("booking_wip_note"));
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("booking_dialog_title")}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 pt-2">
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            {t("booking_wip_note")}
          </div>
          <div>
            <Label>{t("booking_patient")}</Label>
            <Input placeholder={t("search_patients")} disabled />
          </div>
          <div>
            <Label>{t("booking_date")}</Label>
            <Input type="date" />
          </div>
          <div>
            <Label>{t("booking_time_slot")}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SLOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    slot === s ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>{t("booking_note")}</Label>
            <Textarea rows={2} />
          </div>
          <Button className="w-full" onClick={submit}>
            {t("booking_confirm")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
