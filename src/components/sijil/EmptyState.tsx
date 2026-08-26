import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {children}
      {action && (
        <Button className="mt-6 rounded-xl" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
