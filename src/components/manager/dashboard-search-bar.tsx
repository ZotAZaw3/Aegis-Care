import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCopilot } from "@/components/copilot/copilot-context";

export function DashboardSearchBar() {
  const { t } = useI18n();
  const { askQuestion } = useCopilot();
  const [query, setQuery] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    askQuestion(trimmed);
    setQuery("");
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-3xl items-center gap-4 rounded-full border bg-card px-7 py-5 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-ring"
    >
      <Search className="h-6 w-6 shrink-0 text-muted-foreground" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("dashboard_search_placeholder")}
        className="w-full bg-transparent text-lg text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </form>
  );
}
