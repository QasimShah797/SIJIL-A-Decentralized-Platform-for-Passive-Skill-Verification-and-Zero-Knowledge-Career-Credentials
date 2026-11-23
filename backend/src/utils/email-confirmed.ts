import type { User } from "@supabase/supabase-js";

/**
 * Trusted email confirmation check from Supabase Auth `getUser` payload.
 * OAuth providers (google/github/…) count as verified even if email_confirmed_at is odd.
 * Never trust a client-supplied verified boolean.
 */
export function isSupabaseEmailConfirmed(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.email_confirmed_at) return true;
  const identities = user.identities ?? [];
  return identities.some((identity) => {
    const provider = (identity.provider ?? "").toLowerCase();
    return provider.length > 0 && provider !== "email";
  });
}
