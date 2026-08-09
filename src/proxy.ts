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
     * - _next/static    build output
     * - _next/image     image optimiser
     * - favicon.ico and static image files
     */
    "/((?!api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
