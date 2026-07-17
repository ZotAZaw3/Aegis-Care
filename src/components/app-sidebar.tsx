import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, CalendarDays, Shield } from "lucide-react";
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

  const items = [
    { title: t("dashboard"), url: "/dashboard", icon: LayoutDashboard },
    { title: t("patients"), url: "/patients", icon: Users },
    { title: t("appointments"), url: "/appointments", icon: CalendarDays },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3 font-semibold text-primary">
        {t("app_name")}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("app_name")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => (
                <SidebarMenuItem key={it.url}>
                  <SidebarMenuButton asChild isActive={pathname === it.url || pathname.startsWith(it.url + "/")}>
                    <Link to={it.url} className="flex items-center gap-2">
                      <it.icon className="h-4 w-4" />
                      <span>{it.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/admin")}>
                    <Link to="/admin" className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span>{t("admin")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}