// Form thêm Y LỆNH TÙY Ý (ad-hoc, ngoài danh mục KB). Bác sĩ tự nhập → thêm vào danh sách nháp,
// ký chung qua Compliance Judge. is_custom=true → insertSignedOrders để kb_rule_id=null.
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrderDraft, OrderType } from "@/lib/orders";

const ORDER_TYPES: OrderType[] = ["imaging", "lab", "medication", "procedure", "follow_up", "referral"];
const ROLES = ["assistant", "receptionist", "lab_technician", "dentist"];
let seq = 0;

export function CustomOrderForm({ onAdd }: { onAdd: (d: OrderDraft) => void }) {
  const { t } = useI18n();
  const [type, setType] = useState<OrderType>("medication");
  const [role, setRole] = useState("assistant");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [consent, setConsent] = useState(false);

  const add = () => {
    const tt = title.trim();
    if (!tt) { toast.error(t("custom_title_required")); return; }
    onAdd({
      id: `custom-${Date.now()}-${seq++}`,
      procedure_type: "", order_type: type, title: tt, title_vi: tt,
      detail: detail.trim() || null, assigned_role: role, mandatory: false,
      requires_consent: type === "procedure" ? consent : false, needs_review: false,
      close_mode: "evidence", due_offset_hours: null, sort_order: 900, is_custom: true,
    });
    setTitle(""); setDetail(""); setConsent(false);
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <div className="text-xs font-medium text-muted-foreground">{t("custom_order_heading")}</div>
      <Input placeholder={t("custom_title")} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input placeholder={t("custom_detail")} value={detail} onChange={(e) => setDetail(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Select value={type} onValueChange={(v) => setType(v as OrderType)}>
          <SelectTrigger aria-label={t("custom_type")}><SelectValue /></SelectTrigger>
          <SelectContent>{ORDER_TYPES.map((o) => <SelectItem key={o} value={o}>{t(o)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger aria-label={t("custom_role")}><SelectValue /></SelectTrigger>
          <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{t(r)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {type === "procedure" && (
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} />
          {t("requires_consent")}
        </label>
      )}
      <Button size="sm" variant="outline" className="w-full" onClick={add}>
        <Plus className="h-3.5 w-3.5" />
        {t("custom_add")}
      </Button>
    </div>
  );
}
