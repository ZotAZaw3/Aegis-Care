import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Download, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/crm")({
  component: CrmPage,
});

const BUCKET = "crm_data";

function CrmPage() {
  const { t } = useI18n();
  const { roles } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: files } = useQuery({
    queryKey: ["crm-files"],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).list("", { sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;
      return (data ?? []).filter((f) => f.id);
    },
    enabled: roles.includes("admin"),
  });

  if (!roles.includes("admin")) {
    return <div className="text-muted-foreground">Admin only.</div>;
  }

  const upload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file);
    setUploading(false);
    if (error) return toast.error(error.message);
    toast.success(t("saved"));
    if (fileInputRef.current) fileInputRef.current.value = "";
    qc.invalidateQueries({ queryKey: ["crm-files"] });
  };

  const download = async (name: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(name, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const remove = async (name: string) => {
    const { error } = await supabase.storage.from(BUCKET).remove([name]);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["crm-files"] });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">{t("crm")}</h1>
      <p className="text-sm text-muted-foreground">{t("crm_placeholder_note")}</p>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("crm_upload_data")}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input ref={fileInputRef} type="file" className="max-w-xs" />
          <Button onClick={upload} disabled={uploading}>
            <Upload className="h-4 w-4" /> {t("upload")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("uploaded_files")}</CardTitle></CardHeader>
        <CardContent className="p-0 divide-y">
          {!files || files.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{t("no_files_uploaded")}</div>
          ) : files.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("uploaded_at")}: {f.created_at ? new Date(f.created_at).toLocaleString() : "—"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => download(f.name)}><Download className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(f.name)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
