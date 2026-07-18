import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { AlertsBell } from "@/components/alerts-bell";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CopilotProvider } from "@/components/copilot/copilot-context";
import { CopilotChat } from "@/components/copilot/copilot-chat";
import { LogOut, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, loading, roles, signOut } = useAuth();
  const { t } = useI18n();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">…</div>;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <CopilotProvider>
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 h-14 flex items-center justify-between border-b bg-background px-3 gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <div className="hidden sm:flex items-center gap-2 text-primary font-heading font-semibold">
                <Stethoscope className="h-5 w-5" />
                <span>{t("app_name")}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden md:inline text-xs text-muted-foreground truncate max-w-[180px]">{user.email}</span>
              {roles.length > 0 && (
                <span className="hidden md:inline text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                  {roles.map((r) => t(r === "admin" ? "admin_role" : r)).join(", ")}
                </span>
              )}
              <AlertsBell />
              <LanguageToggle />
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="h-4 w-4 mr-1" /> {t("signout")}
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 bg-background overflow-auto">
            {roles.length === 0 ? (
              <div className="max-w-lg mx-auto mt-8 p-6 rounded-lg border bg-card text-card-foreground text-center">
                {t("no_role_assigned")}
              </div>
            ) : (
              <>
                <Breadcrumbs />
                <Outlet />
              </>
            )}
          </main>
        </div>
      </div>
      {roles.length > 0 && <CopilotChat />}
    </SidebarProvider>
    </CopilotProvider>
  );
}