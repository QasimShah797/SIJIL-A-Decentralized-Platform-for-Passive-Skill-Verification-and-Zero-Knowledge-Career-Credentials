import { cn } from "@/lib/utils";

/** Three-dot progress indicator for multi-step async flows (e.g. GitHub OAuth). */
export function DotProgress({
  step,
  className,
}: {
  /** Active step index (0–2). */
  step: 0 | 1 | 2;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-center gap-2", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={2}
      aria-valuenow={step}
      aria-label={`Step ${step + 1} of 3`}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={cn(
            "h-2 w-2 rounded-full transition-all duration-300",
            index === step && "w-6 bg-primary",
            index < step && "bg-primary/60",
            index > step && "bg-muted-foreground/30",
          )}
          aria-hidden
        />
      ))}
    </div>
  );
}
