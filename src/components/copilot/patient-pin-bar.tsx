// Thanh ghim nhiều bệnh nhân cho trang Trợ lý — tìm theo tên, thêm/xóa chip.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCopilot } from "./copilot-context";

interface PRow { id: string; full_name: string }

export function PatientPinBar() {
  const { t } = useI18n();
  const { pinnedPatients, addPinned, removePinned } = useCopilot();
  const [search, setSearch] = useState("");
  const term = search.trim();

  const { data: results = [] } = useQuery({
    queryKey: ["assistant-patient-search", term],
    enabled: term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name")
        .ilike("full_name", `%${term}%`)
        .limit(8);
      if (error) throw error;
      return (data ?? []) as PRow[];
    },
  });

  const pin = (p: PRow) => {
    addPinned(p.id, p.full_name);
    setSearch("");
  };

  const unpinned = results.filter((r) => !pinnedPatients.some((p) => p.id === r.id));

  return (
    <div className="space-y-2">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("assistant_pin_search")}
          className="pl-8"
          aria-label={t("assistant_pin_search")}
        />
        {term.length >= 2 && unpinned.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            {unpinned.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => pin(r)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{r.full_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pinnedPatients.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {pinnedPatients.map((p) => (
            <Badge key={p.id} variant="secondary" className="gap-1 pr-1 text-xs">
              <span className="max-w-[12rem] truncate">{p.name}</span>
              <button
                type="button"
                onClick={() => removePinned(p.id)}
                aria-label={t("assistant_pin_remove")}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("assistant_pin_empty")}</p>
      )}
    </div>
  );
}
