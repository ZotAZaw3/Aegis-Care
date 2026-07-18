// Form hoàn tất lab (P05): chọn mã LOINC whitelist + nhập giá trị → update lab_orders 'completed'.
// Trigger emit_observation_on_lab_done tự chèn emr_observations(source='clinic'). Không mã → chỉ result_note.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ordersDb } from "@/lib/orders";
import { useI18n } from "@/lib/i18n";
import { useStaffId } from "@/lib/use-staff-id";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WhitelistRow { loinc_code: string; label_vi: string; unit: string | null; category: string | null; }
export interface LabRow { id: string; test_name: string }

export function LabCompleteDialog({
  order, open, onOpenChange,
}: { order: LabRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const staffId = useStaffId();
  const [loinc, setLoinc] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: wl } = useQuery<WhitelistRow[]>({
    queryKey: ["obs-whitelist"],
    queryFn: async () => {
      const { data, error } = await ordersDb
        .from("emr_observation_whitelist")
        .select("loinc_code, label_vi, unit, category")
        .eq("active", true);
      if (error) throw error;
      return (data as WhitelistRow[]) ?? [];
    },
  });

  const selected = wl?.find((w) => w.loinc_code === loinc);
  const isText = selected?.category === "behavioral";

  const reset = () => { setLoinc(""); setValue(""); setNote(""); };

  const submit = async () => {
    if (!order) return;
    // Chọn mã LOINC → BẮT BUỘC có giá trị hợp lệ (tránh ghi observation rỗng vào EMR). Không mã → chỉ result_note.
    let valueNum: number | null = null;
    let valueText: string | null = null;
    if (loinc) {
      const raw = value.trim();
      if (!raw) { toast.error(t("lab_value_required")); return; }
      if (isText) {
        valueText = raw;
      } else {
        const n = parseFloat(raw.replace(",", ".")); // hỗ trợ dấu phẩy thập phân kiểu VN
        if (!Number.isFinite(n)) { toast.error(t("lab_value_invalid")); return; }
        valueNum = n;
      }
    }
    setSaving(true);
    const patch: Record<string, unknown> = {
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: staffId ?? null,
      result_note: note || null,
    };
    if (loinc) {
      patch.loinc_code = loinc;
      patch.unit = selected?.unit ?? null;
      patch.value_num = valueNum;
      patch.value_text = valueText;
    }
    const { error } = await ordersDb.from("lab_orders").update(patch).eq("id", order.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("lab_completed"));
    qc.invalidateQueries({ queryKey: ["lab-board"] });
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("lab_complete_title")}{order ? ` · ${order.test_name}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">{t("lab_loinc")}</label>
            <Select value={loinc} onValueChange={setLoinc}>
              <SelectTrigger className="mt-1 min-h-11"><SelectValue placeholder={t("lab_loinc_placeholder")} /></SelectTrigger>
              <SelectContent>
                {(wl ?? []).map((w) => (
                  <SelectItem key={w.loinc_code} value={w.loinc_code}>
                    {w.label_vi}{w.unit ? ` (${w.unit})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {loinc && (
            <div>
              <label className="text-sm font-medium">{t("lab_value")}{selected?.unit ? ` (${selected.unit})` : ""}</label>
              <Input
                className="mt-1 min-h-11"
                inputMode={isText ? "text" : "decimal"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t("lab_value")}
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">{t("lab_note")}</label>
            <Textarea className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button className="min-h-11" onClick={submit} disabled={saving || (!!loinc && !value.trim())}>{t("lab_complete_confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
