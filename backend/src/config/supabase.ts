/**
 * Supabase client factories for the SIJIL backend.
 * Service-role client bypasses RLS for business-logic operations.
 * Anon client is used only for JWT verification via auth.getUser().
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let serviceClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;
const requestClient = new AsyncLocalStorage<SupabaseClient>();

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

/** Recruiter/learner-scoped client — RLS applies as the signed-in user. */
export function getUserSupabase(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Prefer the request-scoped user client when a wallet/recruiter handler set one. */
export function getRequestSupabase(): SupabaseClient {
  return requestClient.getStore() ?? getServiceSupabase();
}

export function runWithUserDb<T>(accessToken: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!accessToken) return fn();
  return requestClient.run(getUserSupabase(accessToken), fn);
}

export function runWithServiceDb<T>(fn: () => Promise<T>): Promise<T> {
  return requestClient.run(getServiceSupabase(), fn);
}
