import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScoreboardItem = {
  icon: LucideIcon;
  value: string | number;
  label: string;
  accent?: "success" | "warning" | "info" | "neutral";
};

const accentStyles = {
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  neutral: "text-foreground",
};

export function ScoreboardStrip({
  items,
  className,
}: {
  items: ScoreboardItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:grid-cols-2 lg:flex lg:divide-x lg:divide-border/60 lg:p-0",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-1 items-center gap-3 px-4 py-3 lg:py-4"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <item.icon className={cn("h-5 w-5", accentStyles[item.accent ?? "neutral"])} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", accentStyles[item.accent ?? "neutral"])}>
              {item.value}
            </p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
