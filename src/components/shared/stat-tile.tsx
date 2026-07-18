// Thẻ số liệu nhỏ (quick-stat) — Data-Dense: nhãn + số lớn tabular. Dùng cho header workspace.
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function StatTile({
  icon, label, value, tone,
}: { icon?: ReactNode; label: string; value: number | string; tone?: "danger" | "warn" }) {
  const color = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-600" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
