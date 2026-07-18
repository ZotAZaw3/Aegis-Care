// Điều hướng theo vai: home mặc định mỗi role + nhớ workspace cuối (multi-role không redirect cứng).
import type { AppRole } from "@/lib/auth";

// Ưu tiên khi multi-role: admin > dentist > assistant > lab > reception.
const HOME_BY_ROLE: Array<[AppRole, string]> = [
  ["admin", "/dashboard"],
  ["dentist", "/clinic"],
  ["assistant", "/execution"],
  ["lab_technician", "/lab"],
  ["receptionist", "/reception"],
];

// Vai nào được vào workspace nào (admin vào hết). Dùng cho gate + nhớ workspace.
const ACCESS: Record<string, AppRole[]> = {
  "/dashboard": ["admin"],
  "/clinic": ["dentist"],
  "/execution": ["assistant"],
  "/lab": ["lab_technician"],
  "/reception": ["receptionist", "assistant"],
};

export const WORKSPACE_PATHS = Object.keys(ACCESS);
const LS_KEY = "aegis_last_workspace";

export function roleCanAccess(roles: AppRole[], path: string): boolean {
  if (roles.includes("admin")) return true;
  return (ACCESS[path] ?? []).some((r) => roles.includes(r));
}

export function resolveHome(roles: AppRole[]): string {
  for (const [role, path] of HOME_BY_ROLE) if (roles.includes(role)) return path;
  return "/dashboard";
}

export function getLastWorkspace(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_KEY);
}

export function setLastWorkspace(path: string): void {
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, path);
}

// Đích sau login: workspace cuối (nếu hợp vai) → else home theo vai.
export function landingFor(roles: AppRole[]): string {
  const last = getLastWorkspace();
  if (last && WORKSPACE_PATHS.includes(last) && roleCanAccess(roles, last)) return last;
  return resolveHome(roles);
}
