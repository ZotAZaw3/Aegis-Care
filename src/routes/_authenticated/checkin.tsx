import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CheckinForm } from "@/components/reception/checkin-form";
import { QueueBoard } from "@/components/reception/queue-board";
import { ConsentQueue } from "@/components/reception/consent-queue";
import { FinalizeList } from "@/components/reception/finalize-list";

export const Route = createFileRoute("/_authenticated/checkin")({
  component: CheckinPage,
});

function CheckinPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"checkin" | "finalize">("checkin");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold flex-1">{t("check_in")}</h1>
        <div className="inline-flex rounded-md border p-0.5">
          <button
            className={cn("px-3 py-1.5 text-sm rounded", tab === "checkin" && "bg-primary text-primary-foreground")}
            onClick={() => setTab("checkin")}
          >
            {t("checkin_tab")}
          </button>
          <button
            className={cn("px-3 py-1.5 text-sm rounded", tab === "finalize" && "bg-primary text-primary-foreground")}
            onClick={() => setTab("finalize")}
          >
            {t("finalize_tab")}
          </button>
        </div>
      </div>

      {tab === "checkin" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <CheckinForm />
          </div>
          <div className="space-y-4">
            <QueueBoard />
            <ConsentQueue />
          </div>
        </div>
      ) : (
        <div className="max-w-3xl">
          <FinalizeList />
        </div>
      )}
    </div>
  );
}
