import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { currentStaffId } from "@/lib/orders";
import { useMyDepartments } from "@/lib/departments";
import { submitConsent, explainGate, type ConsentSigner } from "@/lib/consent";

interface Props {
  consentOrderId: string;
  parentOpenedAt: string | null;
  patientDob: string | null;
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function ConsentForm({ consentOrderId, parentOpenedAt, patientDob, onClose }: Props) {
  const { t } = useI18n();
  const { user, roles } = useAuth();
  const { data: myDepts } = useMyDepartments();
  const qc = useQueryClient();
  const [signer, setSigner] = useState<ConsentSigner>("patient");
  const [signedDate, setSignedDate] = useState(today());
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const preCheck = explainGate(parentOpenedAt, patientDob, signer, signedDate);
  // P2: consent order thuộc phòng Tiếp đón → chỉ reception (hoặc dentist/admin override) nạp được.
  // Chặn ở UI để tránh partial-write (consents mồ côi) trước khi RLS chặn order_evidence.
  const canSubmit =
    roles.includes("dentist") || roles.includes("admin") || (myDepts ?? []).some((d) => d.code === "reception");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanFile) return;
    const staffId = user ? await currentStaffId(user.id) : undefined;
    if (!staffId) return toast.error(t("no_staff_profile"));
    setBusy(true);
    try {
      const status = await submitConsent(consentOrderId, { signer, signedDate, scanFile }, staffId);
      if (status === "closed") {
        toast.success(t("gate_closed"));
      } else {
        const reason = explainGate(parentOpenedAt, patientDob, signer, signedDate);
        toast.warning(`${t("gate_still_open")}${reason ? ` — ${t(reason)}` : ""}`);
      }
      qc.invalidateQueries({ queryKey: ["consent-queue"] });
      qc.invalidateQueries({ queryKey: ["active-orders"] });
      onClose();
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "42501") toast.error(t("not_in_department"));
      else toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label>{t("signer")}</Label>
        <Select value={signer} onValueChange={(v) => setSigner(v as ConsentSigner)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="patient">{t("patient_signer")}</SelectItem>
            <SelectItem value="guardian">{t("guardian")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>{t("signed_date")}</Label>
        <Input type="date" value={signedDate} max={today()} onChange={(e) => setSignedDate(e.target.value)} />
      </div>
      <div>
        <Label>{t("upload_scan")}</Label>
        <Input type="file" accept="image/*,application/pdf" onChange={(e) => setScanFile(e.target.files?.[0] ?? null)} />
      </div>
      {preCheck && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {t("gate_open_reason")}: {t(preCheck)}
        </div>
      )}
      {!canSubmit && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
          {t("not_in_department")}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={busy || !scanFile || !canSubmit}>{t("submit_consent")}</Button>
    </form>
  );
}
