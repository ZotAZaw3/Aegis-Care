import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

const ROLES: AppRole[] = ["admin", "dentist", "assistant", "receptionist", "lab_technician"];

function AdminPage() {
  const { t } = useI18n();
  const { roles } = useAuth();
  const qc = useQueryClient();

  const { data: staff } = useQuery({
    queryKey: ["all-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, user_id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: roles.includes("admin"),
  });

  const { data: allRoles } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data;
    },
    enabled: roles.includes("admin"),
  });

  if (!roles.includes("admin")) {
    return <div className="text-muted-foreground">Admin only.</div>;
  }

  const roleFor = (uid: string) => (allRoles ?? []).find((r) => r.user_id === uid)?.role as AppRole | undefined;

  const setRole = async (uid: string, newRole: AppRole) => {
    // Simple model: one role per user. Delete existing, insert new.
    await supabase.from("user_roles").delete().eq("user_id", uid);
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: newRole });
    if (error) return toast.error(error.message);
    toast.success(t("role_updated"));
    qc.invalidateQueries({ queryKey: ["all-roles"] });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">{t("staff_management")}</h1>
      <Card>
        <CardHeader><CardTitle>{t("users")}</CardTitle></CardHeader>
        <CardContent className="p-0 divide-y">
          {staff?.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <div className="font-medium">{s.full_name}</div>
                <div className="text-xs text-muted-foreground">{roleFor(s.user_id) ? t(roleFor(s.user_id) === "admin" ? "admin_role" : roleFor(s.user_id)!) : "—"}</div>
              </div>
              <Select value={roleFor(s.user_id) ?? ""} onValueChange={(v) => setRole(s.user_id, v as AppRole)}>
                <SelectTrigger className="w-48"><SelectValue placeholder={t("assign_role")} /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{t(r === "admin" ? "admin_role" : r)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}