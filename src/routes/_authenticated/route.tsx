import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { LogOut } from "lucide-react";

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
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-background px-3 gap-2">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <span className="font-medium text-sm text-muted-foreground truncate">{user.email}</span>
              {roles.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-accent text-accent-foreground">
                  {roles.map((r) => t(r === "admin" ? "admin_role" : r)).join(", ")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <LanguageToggle />
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="h-4 w-4 mr-1" /> {t("signout")}
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 bg-muted/20 overflow-auto">
            {roles.length === 0 ? (
              <div className="max-w-lg mx-auto mt-8 p-6 rounded-lg border bg-card text-card-foreground text-center">
                {t("no_role_assigned")}
              </div>
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}