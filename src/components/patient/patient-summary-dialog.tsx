// Nút + dialog tóm tắt hồ sơ BN — gọi /api/patient-summary (retrieval từ Customer Graph).
import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Render nhẹ markdown: "## X" → tiêu đề đậm, dòng khác → thường (tránh hiện ký tự ## thô).
function renderLines(text: string) {
  return text.split("\n").map((line, i) => {
    const h = line.match(/^##\s+(.*)/);
    if (h) return <div key={i} className="mt-3 mb-1 font-semibold text-foreground first:mt-0">{h[1]}</div>;
    if (line.trim() === "") return <div key={i} className="h-1.5" />;
    return <div key={i} className="text-muted-foreground">{line}</div>;
  });
}

export function PatientSummaryDialog({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setOpen(true);
    setLoading(true);
    setSummary(null);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setError(t("copilot_error_auth")); return; }
      const res = await fetch("/api/patient-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patient_id: patientId }),
      });
      if (!res.ok) { setError(t("summary_error")); return; }
      const j = await res.json();
      if (!j.summary) setError(t("summary_error")); // null = LLM lỗi, KHÔNG phải thiếu dữ liệu
      else setSummary(j.summary);
    } catch {
      setError(t("summary_error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
        <Sparkles className="h-4 w-4" />
        {t("summarize")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("summary_title")} · {patientName}
            </DialogTitle>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("summary_generating")}
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
          ) : summary ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">{renderLines(summary)}</div>
          ) : null}
          <p className="text-[11px] text-muted-foreground">{t("summary_disclaimer")}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
