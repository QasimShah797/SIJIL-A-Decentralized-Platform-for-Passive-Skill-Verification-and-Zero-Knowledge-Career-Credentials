/**
 * Low-level Supabase database access wrapper used by all domain services.
 * A real service-role key bypasses RLS. When that key is missing and the
 * request is running with the learner's access token, queries use that
 * session so learner-owned rows stay visible.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";
import { getRequestSupabase, getServiceSupabase } from "../config/supabase";

export class SupabaseService {
  get client(): SupabaseClient {
    if (env.SUPABASE_SERVICE_ROLE_KEY !== env.SUPABASE_ANON_KEY) {
      return getServiceSupabase();
    }
    return getRequestSupabase();
  }
}

export const supabaseService = new SupabaseService();
