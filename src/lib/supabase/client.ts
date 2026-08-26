import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import { fetchWithClockSkewRetry } from "@/lib/supabase/fetch";
import type { Database } from "@/types/database";

/**
 * Supabase client for Client Components. Runs as the logged-in user, so every
 * query is subject to RLS.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      global: { fetch: fetchWithClockSkewRetry },
    },
  );
}
