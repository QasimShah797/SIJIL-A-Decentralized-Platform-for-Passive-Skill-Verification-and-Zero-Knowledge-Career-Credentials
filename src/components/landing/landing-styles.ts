import { cn } from "@/lib/utils";

export const landingContainer = "landing-container mx-auto w-full max-w-[1220px] px-5 sm:px-6 lg:px-8";

export const landingSection = "landing-section scroll-mt-[4.25rem]";

export const landingSectionAlt = "bg-muted/35 dark:bg-muted/20";

export const landingCard =
  "rounded-[1.125rem] border border-border/60 bg-card shadow-sm transition-shadow duration-200 hover:shadow-md";

export function landingNavLink(active: boolean) {
  return cn(
    "rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
  );
}

export const landingBtnPrimary =
  "inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export const landingBtnSecondary =
  "inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
