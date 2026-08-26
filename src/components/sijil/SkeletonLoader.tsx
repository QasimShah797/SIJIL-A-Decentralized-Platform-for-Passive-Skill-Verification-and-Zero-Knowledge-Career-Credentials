import { cn } from "@/lib/utils";

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} aria-hidden />;
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-6 animate-fade-in" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <SkeletonBlock className="h-8 w-64" />
        <SkeletonBlock className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/70 p-6 space-y-4" aria-busy="true">
      <SkeletonBlock className="h-5 w-40" />
      <SkeletonBlock className="h-4 w-full" />
      <SkeletonBlock className="h-4 w-3/4" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      <SkeletonBlock className="h-10 w-full rounded-xl" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}
