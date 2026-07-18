import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { RecallQueue } from "@/components/reception/recall-queue";

export const Route = createFileRoute("/_authenticated/follow-ups")({
  component: FollowUpsPage,
});

function FollowUpsPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">{t("recall")}</h1>
      <RecallQueue />
    </div>
  );
}
