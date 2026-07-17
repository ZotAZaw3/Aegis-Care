import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, UserPlus, ListOrdered, Shield, ClipboardList, Stethoscope, Database } from "lucide-react";
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
} from "@/components/ui/sidebar";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export function AppSidebar() {
  const { t } = useI18n();
  const { roles } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isAdmin = roles.includes("admin");
  const has = (...allowed: string[]) => isAdmin || allowed.some((r) => roles.includes(r as any));

  const items = [
    { title: t("dashboard"), url: "/dashboard", icon: LayoutDashboard },
    { title: t("patients"), url: "/patients", icon: Users },
    ...(has("receptionist") ? [{ title: t("check_in"), url: "/checkin", icon: UserPlus }] : []),
    ...(has("assistant") ? [{ title: t("queue"), url: "/queue", icon: ListOrdered }] : []),
    { title: t("follow_ups"), url: "/follow-ups", icon: ClipboardList },
    ...(isAdmin ? [{ title: t("crm"), url: "/crm", icon: Database }] : []),
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3.5 flex-row items-center gap-2 font-heading font-semibold text-primary">
        <Stethoscope className="h-5 w-5 shrink-0" />
        <span className="truncate group-data-[collapsible=icon]:hidden">{t("app_name")}</span>
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
                      className={active ? "border-l-[3px] border-primary bg-accent/60 text-primary font-medium rounded-none" : ""}
                    >
                      <Link to={it.url} className="flex items-center gap-2">
                        <it.icon className="h-4 w-4" />
                        <span>{it.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {isAdmin && (
                (() => {
                  const active = pathname.startsWith("/admin");
                  return (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className={active ? "border-l-[3px] border-primary bg-accent/60 text-primary font-medium rounded-none" : ""}
                      >
                        <Link to="/admin" className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <span>{t("admin")}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })()
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}