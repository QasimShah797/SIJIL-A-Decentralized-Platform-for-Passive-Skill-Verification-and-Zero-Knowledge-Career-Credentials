/**
 * Supabase client factories for the SIJIL backend.
 * Service-role client bypasses RLS for business-logic operations.
 * Anon client is used only for JWT verification via auth.getUser().
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let serviceClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return serviceClient;
}

export function getAnonSupabase(): SupabaseClient {
  if (!anonClient) {
    anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonClient;
}
