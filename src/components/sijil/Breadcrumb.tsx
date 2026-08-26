import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("mb-4 flex items-center gap-1 text-xs text-muted-foreground", className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden />}
            {item.href && !isLast ? (
              <Link to={item.href} className="hover:text-foreground transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={cn(isLast && "font-medium text-foreground")} aria-current={isLast ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
