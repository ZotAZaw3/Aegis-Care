import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { HomeSuggestion } from "./use-home-suggestions";

const VISIBLE_CAP = 6;

interface Props {
  suggestions: HomeSuggestion[];
  onOpenBooking: () => void;
}

export function SuggestionRail({ suggestions, onOpenBooking }: Props) {
  const { t, lang } = useI18n();
  const [expanded, setExpanded] = useState(false);

  if (suggestions.length === 0) return null;

  const shown = expanded ? suggestions : suggestions.slice(0, VISIBLE_CAP);
  const hiddenCount = suggestions.length - shown.length;

  return (
    <div className="grid w-full gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {shown.map((s) => {
        const Icon = s.icon;
        const iconWrap = cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          s.severity === "critical"
            ? "bg-destructive/15 text-destructive"
            : s.severity === "warning"
              ? "bg-warning/15 text-warning"
              : "bg-accent text-accent-foreground",
        );
        const cardClass =
          "flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none";

        const content = (
          <>
            <span className={iconWrap}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium">{s.text}</span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{s.meta}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                {s.roleLabel}
              </span>
              {s.isNew && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-warning">{t("home_ui_preview")}</span>
              )}
            </span>
          </>
        );

        if (s.openBooking) {
          return (
            <button key={s.id} type="button" onClick={onOpenBooking} className={cardClass}>
              {content}
            </button>
          );
        }

        return (
          <Link key={s.id} to={s.to!.to as any} params={s.to!.params as any} className={cardClass}>
            {content}
          </Link>
        );
      })}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-3.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <span>{lang === "vi" ? `+${hiddenCount} gợi ý khác` : `+${hiddenCount} more suggestions`}</span>
        </button>
      )}
    </div>
  );
}
