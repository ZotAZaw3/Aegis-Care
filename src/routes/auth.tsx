import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { LanguageToggle } from "@/components/language-toggle";
import { Stethoscope, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success(t("saved"));
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-10 xl:p-14">
        <div className="flex items-center gap-2.5 font-heading text-lg font-semibold">
          <Stethoscope className="h-6 w-6" />
          <span>{t("app_name")}</span>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="font-heading text-3xl xl:text-4xl font-semibold leading-tight">{t("app_tagline")}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-primary-foreground/80">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>{t("data_security_note")}</span>
        </div>
      </div>

      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-6 lg:hidden">
            <div className="flex items-center gap-2 font-heading font-semibold text-primary">
              <Stethoscope className="h-5 w-5" />
              <span>{t("app_name")}</span>
            </div>
            <LanguageToggle />
          </div>
          <div className="hidden lg:flex justify-end mb-4"><LanguageToggle /></div>
          <Card className="shadow-lg border-border/60">
            <CardHeader>
              <CardTitle className="font-heading text-2xl">
                {mode === "signup" ? t("signup") : t("signin")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="fn">{t("full_name")}</Label>
                    <Input id="fn" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="em">{t("email")}</Label>
                  <Input id="em" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw">{t("password")}</Label>
                  <Input
                    id="pw"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {mode === "signup" ? t("signup") : t("signin")}
                </Button>
                <button
                  type="button"
                  className="text-sm text-primary hover:underline w-full text-center"
                  onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                >
                  {mode === "signup" ? t("already_have_account") + " " + t("signin") : t("no_account") + " " + t("signup")}
                </button>
                {mode === "signup" && (
                  <p className="text-xs text-muted-foreground text-center">{t("add_first_admin_hint")}</p>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}