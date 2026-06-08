import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Human-readable message from Supabase / PostgREST errors (plain objects, not Error instances). */
export function formatSupabaseError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  return "Something went wrong. Please try again.";
}
