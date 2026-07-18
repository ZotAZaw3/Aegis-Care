// Dải "Luồng vận hành" 4 bước — giúp hiểu vị trí trong luồng: Tiếp đón → Khám → Tạo y lệnh → Thực thi.
import { UserPlus, Stethoscope, FileSignature, ClipboardCheck, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";

export function ClinicFlowStrip() {
  const { t } = useI18n();
  const steps = [
    { icon: UserPlus, label: t("flow_reception") },
    { icon: Stethoscope, label: t("flow_exam") },
    { icon: FileSignature, label: t("flow_order") },
    { icon: ClipboardCheck, label: t("flow_execute") },
  ];
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2 p-3 text-xs">
        <span className="font-medium text-muted-foreground">{t("flow_title")}:</span>
        {steps.map((s, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1">
              <s.icon className="h-3.5 w-3.5 text-primary" />
              {s.label}
            </span>
            {i < steps.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </span>
        ))}
      </CardContent>
    </Card>
  );
}
