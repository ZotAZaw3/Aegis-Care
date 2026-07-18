import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Shield,
  ClipboardList,
  Stethoscope,
  Database,
  PanelLeftClose,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const { t } = useI18n();
  const { roles } = useAuth();
  const { isMobile, setOpen } = useSidebar();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isAdmin = roles.includes("admin");
  const has = (...allowed: string[]) => isAdmin || allowed.some((r) => roles.includes(r as any));

  const items = [
    { title: t("dashboard"), url: "/dashboard", icon: LayoutDashboard },
    { title: t("patients"), url: "/patients", icon: Users },
    ...(has("receptionist", "assistant")
      ? [{ title: t("reception_management"), url: "/reception", icon: UserPlus }]
      : []),
    { title: t("follow_ups"), url: "/follow-ups", icon: ClipboardList },
    ...(isAdmin ? [{ title: t("crm"), url: "/crm", icon: Database }] : []),
  ];

  return (
    <div
      onMouseEnter={() => !isMobile && setOpen(true)}
      onMouseLeave={() => !isMobile && setOpen(false)}
    >
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-4 py-3.5 flex-row items-center justify-between gap-2">
          <Link
            to="/dashboard"
            className="flex min-w-0 items-center gap-2 font-heading font-semibold text-sidebar-foreground hover:text-sidebar-primary transition-colors"
          >
            <Stethoscope className="h-6 w-6 shrink-0 text-sidebar-primary" />
            <span className="truncate group-data-[collapsible=icon]:hidden">{t("app_name")}</span>
          </Link>
          <button
            type="button"
            aria-label={t("collapse_sidebar")}
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-md p-1 text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("app_name")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => {
                const active = pathname === it.url || pathname.startsWith(it.url + "/");
                return (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={cn(
                        "border-l-[3px] border-transparent rounded-none",
                        active && "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                      )}
                    >
                      <Link to={it.url} className="flex items-center gap-2.5">
                        <it.icon className="h-5 w-5 shrink-0" />
                        <span>{it.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {isAdmin &&
                (() => {
                  const active = pathname.startsWith("/admin");
                  return (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className={cn(
                          "border-l-[3px] border-transparent rounded-none",
                          active && "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                        )}
                      >
                        <Link to="/admin" className="flex items-center gap-2.5">
                          <Shield className="h-5 w-5 shrink-0" />
                          <span>{t("admin")}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })()}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      </Sidebar>
    </div>
  );
}
