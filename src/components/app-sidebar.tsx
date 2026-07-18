import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, UserPlus, Shield, ClipboardList, Database } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useI18n } from "@/lib/i18n";
import { useAuth, type AppRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const { t } = useI18n();
  const { roles } = useAuth();
  const { isMobile, setOpen } = useSidebar();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isAdmin = roles.includes("admin");
  const has = (...allowed: AppRole[]) => isAdmin || allowed.some((r) => roles.includes(r));

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
      <Sidebar collapsible="icon" className="!top-14 !bottom-0 !h-auto">
        <SidebarContent>
          <SidebarGroup>
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
                          active &&
                            "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                        )}
                      >
                        <Link to={it.url} className="flex items-center gap-2.5">
                          <it.icon className="!h-6 !w-6 shrink-0" />
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
                            active &&
                              "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                          )}
                        >
                          <Link to="/admin" className="flex items-center gap-2.5">
                            <Shield className="!h-6 !w-6 shrink-0" />
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
