import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/* Credentials come from the environment, never the repository. Copy
   .env.example to .env.local and fill it in; see README for where the values
   live in the Supabase dashboard. */

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && publishableKey);

export type Db = SupabaseClient<Database>;

/** Null when the app has not been pointed at a project yet, so the UI can say
 *  so instead of failing on the first request. */
export const supabase: Db | null = isConfigured
  ? createClient<Database>(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

export function requireDb(): Db {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}
