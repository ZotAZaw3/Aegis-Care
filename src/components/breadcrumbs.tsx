import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const labelMap: Record<string, string> = {
  dashboard: "dashboard",
  patients: "patients",
  checkin: "check_in",
  queue: "queue",
  lab: "lab",
  visits: "sessions",
  admin: "admin",
  "follow-ups": "follow_ups",
};

export function Breadcrumbs() {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const crumbs: { href: string; label: string }[] = [];
  let acc = "";
  segments.forEach((seg) => {
    acc += "/" + seg;
    const key = labelMap[seg];
    const label = key ? t(key) : decodeURIComponent(seg);
    crumbs.push({ href: acc, label });
  });

  return (
    <nav aria-label="breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
      <Link to="/dashboard" className="hover:text-primary inline-flex items-center gap-1">
        <Home className="h-3.5 w-3.5" />
        <span>{t("home")}</span>
      </Link>
      {crumbs.map((c, i) => (
        <span key={c.href} className="inline-flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          {i === crumbs.length - 1 ? (
            <span className="text-foreground font-medium truncate max-w-[220px]">{c.label}</span>
          ) : (
            <Link to={c.href as any} className="hover:text-primary truncate max-w-[160px]">{c.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}