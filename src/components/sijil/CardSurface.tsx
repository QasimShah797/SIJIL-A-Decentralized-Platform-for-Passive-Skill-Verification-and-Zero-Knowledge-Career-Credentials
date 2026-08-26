import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/sijil/StatusBadge";

type CardVariant = "flat" | "elevated" | "interactive";

const variants: Record<CardVariant, string> = {
  flat: "rounded-2xl border border-border/70 bg-card",
  elevated: "rounded-2xl border border-border/70 bg-card shadow-md",
  interactive:
    "rounded-2xl border border-border/70 bg-card transition-all hover:border-primary/40 hover:shadow-sm cursor-pointer",
};

export function CardSurface({
  variant = "flat",
  padding = "default",
  className,
  children,
  onClick,
  as: Component = "div",
}: {
  variant?: CardVariant;
  padding?: "compact" | "default" | "hero";
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  as?: "div" | "article" | "section";
}) {
  const paddingClass =
    padding === "compact" ? "p-4" : padding === "hero" ? "p-8" : "p-6";

  return (
    <Component
      className={cn(variants[variant], paddingClass, className)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </Component>
  );
}

export function CredentialCard({
  title,
  subtitle,
  status,
  statusVariant,
  meta,
  actions,
  className,
  onClick,
  children,
}: {
  title: string;
  subtitle?: string;
  status?: string;
  statusVariant?: "verified" | "warning" | "info" | "neutral" | "destructive" | "pending";
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <CardSurface
      variant={onClick ? "interactive" : "flat"}
      className={cn("relative flex flex-col gap-3", className)}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight truncate">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {status && <StatusBadge variant={statusVariant ?? "neutral"}>{status}</StatusBadge>}
      </div>
      {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
      {children}
      {actions && <div className="mt-auto flex flex-wrap gap-2 pt-2">{actions}</div>}
    </CardSurface>
  );
}
