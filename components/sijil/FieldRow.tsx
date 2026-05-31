import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { InfoHint } from "./InfoHint";

export function FieldRow({
  label,
  value,
  hint,
  mono,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[180px_1fr] gap-4 py-2.5 border-b border-border/60 last:border-0", className)}>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {label}
        {hint && <InfoHint text={hint} />}
      </div>
      <div className={cn("text-sm text-foreground break-all", mono && "mono text-[13px]")}>{value}</div>
    </div>
  );
}
