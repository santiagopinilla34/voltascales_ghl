import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except:
     * - api/webhooks    Twilio and form callbacks; unauthenticated by design,
     *                   verified by request signature instead (PRD 4.2/4.3/4.6)
     * - api/cron        Vercel Cron; there is no session on a scheduled
     *                   request, and it authenticates itself with CRON_SECRET.
     *                   Left in the matcher it would get a 401 from the proxy
     *                   before the route could check its own header.
     * - _next/static    build output
     * - _next/image     image optimiser
     * - favicon.ico and static image files
     *
     * Note /book is *not* excluded — it goes through the proxy and is allowed
     * through by PUBLIC_PATHS, so its Server Actions still get a session when
     * one exists.
     */
    "/((?!api/webhooks|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
