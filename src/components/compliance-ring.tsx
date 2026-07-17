import { cn } from "@/lib/utils";

export function ComplianceRing({
  value,
  size = 44,
  strokeWidth = 5,
  className,
}: {
  value: number | null | undefined;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const v = value == null ? null : Math.max(0, Math.min(100, Math.round(Number(value))));
  const color =
    v == null ? "text-muted-foreground"
      : v >= 90 ? "text-success"
      : v >= 70 ? "text-warning"
      : "text-destructive";
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = v == null ? c : c - (v / 100) * c;
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={strokeWidth} className="text-muted/60" stroke="currentColor" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={strokeWidth}
          className={color}
          stroke="currentColor"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className={cn("absolute text-[11px] font-semibold", color)}>
        {v == null ? "—" : `${v}`}
      </span>
    </div>
  );
}