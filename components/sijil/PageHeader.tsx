import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 pb-5 border-b border-border/60", className)}>
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
