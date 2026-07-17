import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const roleClass: Record<string, string> = {
  admin: "bg-primary/10 text-primary border-primary/30",
  dentist: "bg-success/10 text-success border-success/30",
  assistant: "bg-warning/10 text-warning border-warning/30",
  receptionist: "bg-accent text-accent-foreground border-border",
};

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const { t } = useI18n();
  const label = t(role === "admin" ? "admin_role" : role);
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border", roleClass[role] ?? "bg-muted text-muted-foreground border-border", className)}>
      {label}
    </span>
  );
}