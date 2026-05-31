import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "verified" | "warning" | "info" | "neutral" | "destructive" | "outline";

const styles: Record<Variant, string> = {
  verified: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning-foreground border-warning/30",
  info: "bg-info-soft text-info border-info/20",
  neutral: "bg-secondary text-secondary-foreground border-border",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  outline: "bg-transparent text-foreground border-border",
};

export function StatusBadge({
  children,
  variant = "neutral",
  className,
  icon,
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
