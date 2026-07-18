import { ArrowRight, ChevronLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import type { HomeSuggestion } from "./use-home-suggestions";

interface Props {
  suggestion: HomeSuggestion;
  onBack: () => void;
  onOpenBooking: () => void;
}

export function ThreadView({ suggestion, onBack, onOpenBooking }: Props) {
  const { t } = useI18n();

  const chip = (
    <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-primary bg-card px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
      {suggestion.chipLabel}
      <ArrowRight className="h-3.5 w-3.5" />
    </span>
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-8">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("home")}
      </button>

      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
            {suggestion.userLine}
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground">
            <p>{suggestion.assistantLine}</p>
            {suggestion.openBooking ? (
              <button type="button" onClick={onOpenBooking} className="cursor-pointer">
                {chip}
              </button>
            ) : (
              <Link to={suggestion.to!.to as any} params={suggestion.to!.params as any}>
                {chip}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
