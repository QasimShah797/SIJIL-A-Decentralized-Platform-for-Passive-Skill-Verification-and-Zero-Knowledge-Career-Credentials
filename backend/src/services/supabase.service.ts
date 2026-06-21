/**
 * Low-level Supabase database access wrapper used by all domain services.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "../config/supabase";

export class SupabaseService {
  get client(): SupabaseClient {
    return getServiceSupabase();
  }
}

export const supabaseService = new SupabaseService();
