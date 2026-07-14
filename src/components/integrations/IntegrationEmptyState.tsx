import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type IntegrationEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
};

export function IntegrationEmptyState({
  icon: Icon,
  title,
  hint,
  action,
  compact = false,
  className,
}: IntegrationEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-4",
        compact ? "py-8 min-h-[180px] max-h-[220px]" : "py-10",
        className,
      )}
    >
      <Icon className="h-7 w-7 text-muted-foreground mb-2.5" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
