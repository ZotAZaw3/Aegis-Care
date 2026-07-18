import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckinForm } from "@/components/reception/checkin-form";
import { ReceptionBoard } from "@/components/reception/reception-board";
import { ConsentQueue } from "@/components/reception/consent-queue";
import { OrderExecutionList } from "@/components/assistant/order-execution-list";
import { UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reception")({
  component: ReceptionPage,
});

function ReceptionPage() {
  const { t } = useI18n();
  const [checkinOpen, setCheckinOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold flex-1">{t("reception_management")}</h1>
        <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
          <Button onClick={() => setCheckinOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            {t("new_checkin")}
          </Button>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("checkin_patient")}</DialogTitle></DialogHeader>
            <CheckinForm onDone={() => setCheckinOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <ReceptionBoard />

      <div className="grid gap-4 lg:grid-cols-2">
        <ConsentQueue />
        <OrderExecutionList />
      </div>
    </div>
  );
}
