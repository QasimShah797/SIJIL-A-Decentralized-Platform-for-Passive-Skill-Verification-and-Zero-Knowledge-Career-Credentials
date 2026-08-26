import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PipelineStage = {
  id: string;
  label: string;
  status: "complete" | "current" | "upcoming";
};

export function PipelineStepper({
  stages,
  className,
}: {
  stages: PipelineStage[];
  className?: string;
}) {
  return (
    <nav aria-label="Pipeline progress" className={cn("w-full", className)}>
      <ol className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
        {stages.map((stage, index) => (
          <li key={stage.id} className="flex min-w-0 flex-1 items-center">
            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  stage.status === "complete" && "border-success bg-success text-success-foreground",
                  stage.status === "current" && "border-primary bg-primary/10 text-primary",
                  stage.status === "upcoming" && "border-border bg-muted text-muted-foreground",
                )}
                aria-current={stage.status === "current" ? "step" : undefined}
              >
                {stage.status === "complete" ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={cn(
                  "max-w-[4.5rem] truncate text-center text-[10px] font-medium sm:max-w-none sm:text-xs",
                  stage.status === "current" ? "text-primary" : "text-muted-foreground",
                )}
              >
                {stage.label}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-0.5 min-w-[1rem] flex-1 rounded-full",
                  stage.status === "complete" ? "bg-success/60" : "bg-border",
                )}
                aria-hidden
              />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
