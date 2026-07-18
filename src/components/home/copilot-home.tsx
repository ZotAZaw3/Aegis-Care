import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { DashboardSearchBar } from "@/components/manager/dashboard-search-bar";
import { SuggestionRail } from "./suggestion-rail";
import { BookingDialog } from "./booking-dialog";
import { useHomeSuggestions } from "./use-home-suggestions";

export function CopilotHome() {
  const { t, lang } = useI18n();
  const { roles } = useAuth();
  const { all } = useHomeSuggestions();
  const [bookingOpen, setBookingOpen] = useState(false);

  const roleLabels = roles.map((r) => t(r === "admin" ? "admin_role" : r));

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-6 py-8">
      {roleLabels.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {roleLabels.map((l) => (
            <span key={l} className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
              {l}
            </span>
          ))}
        </div>
      )}

      <div className="text-center">
        <h1 className="font-heading text-2xl font-semibold">{t("home_greeting")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {all.length === 0
            ? t("home_all_clear")
            : lang === "vi"
              ? `Bạn có ${all.length} việc đang chờ, gộp từ ${roleLabels.join(" + ")}.`
              : `You have ${all.length} things waiting, merged from ${roleLabels.join(" + ")}.`}
        </p>
      </div>

      <SuggestionRail suggestions={all} onOpenBooking={() => setBookingOpen(true)} />

      <div className="w-full max-w-2xl">
        <DashboardSearchBar />
      </div>

      <BookingDialog open={bookingOpen} onOpenChange={setBookingOpen} />
    </div>
  );
}
