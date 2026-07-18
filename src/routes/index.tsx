import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ShieldCheck, Stethoscope } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { landingFor } from "@/lib/resolve-home";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { SiteFooter } from "@/components/site-footer";
import { PatientJourney } from "@/components/landing/patient-journey";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
  const { user, loading, roles } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">…</div>
    );
  if (user) return <Navigate to={landingFor(roles) as string} replace />;
  return <LandingPage />;
}

function LandingPage() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2 font-heading font-semibold text-primary">
          <Stethoscope className="h-5 w-5" />
          <span>{t("app_name")}</span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <Button asChild size="sm">
            <Link to="/auth">{t("signin")}</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <div className="max-w-xl text-center">
          <h1 className="font-heading text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
            {t("app_tagline")}
          </h1>
          <div className="mt-6">
            <Button asChild size="lg">
              <Link to="/auth">{t("footer_cta")}</Link>
            </Button>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>{t("data_security_note")}</span>
          </div>
        </div>
      </main>

      <PatientJourney />

      <SiteFooter />
    </div>
  );
}
