import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type FilterOption = {
  id: string;
  label: string;
};

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters,
  activeFilter,
  onFilterChange,
  className,
  children,
}: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterOption[];
  activeFilter?: string;
  onFilterChange?: (id: string) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      {onSearchChange !== undefined && (
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="rounded-xl pl-9"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {filters?.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilterChange?.(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeFilter === f.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
        {children}
      </div>
    </div>
  );
}
