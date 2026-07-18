import { Search } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function DashboardSearchBar() {
  const { t } = useI18n();

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-4 rounded-full border bg-card px-7 py-5 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-ring">
      <Search className="h-6 w-6 shrink-0 text-muted-foreground" />
      <input
        type="text"
        placeholder={t("dashboard_search_placeholder")}
        className="w-full bg-transparent text-lg text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
}
