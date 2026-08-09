import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client. Bypasses RLS entirely.
 *
 * Only for trusted server-side code that has no user session — chiefly the
 * Twilio and form webhooks (PRD 4.2, 4.3, 4.6) and the scheduled automation
 * runner (PRD 4.5). Never expose this client, or the key behind it, to the
 * browser.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
