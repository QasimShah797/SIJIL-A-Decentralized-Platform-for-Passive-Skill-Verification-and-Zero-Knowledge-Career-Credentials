import { Info } from "lucide-react";
import { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function StubControl({
  label,
  reason,
  children,
  className,
}: {
  label: string;
  reason: string;
  children?: ReactNode;
  className?: string;
}) {
  const id = `stub-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-2 text-sm text-muted-foreground opacity-70",
            className,
          )}
          aria-disabled="true"
          aria-describedby={id}
        >
          {children ?? label}
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </div>
      </TooltipTrigger>
      <TooltipContent id={id} side="top" className="max-w-xs">
        <p>{reason}</p>
      </TooltipContent>
    </Tooltip>
  );
}
