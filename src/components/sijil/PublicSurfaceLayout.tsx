import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Wrapper for public/token-gated surfaces (login, verify, review forms). */
export function PublicSurfaceLayout({
  children,
  className,
  accent = "default",
}: {
  children: ReactNode;
  className?: string;
  accent?: "default" | "strong";
}) {
  return (
    <div
      className={cn(
        "min-h-screen",
        accent === "strong" ? "public-surface-strong" : "public-surface",
        className,
      )}
    >
      {children}
    </div>
  );
}
