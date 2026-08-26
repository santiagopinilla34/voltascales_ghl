/**
 * A `fetch` that rides out the few seconds after a token refresh during which
 * PostgREST rejects the brand-new access token.
 *
 * The failure looks like this: the proxy refreshes the session, GoTrue mints an
 * access token stamped `iat = now`, and the render that follows immediately
 * spends it — but PostgREST's clock is a beat behind GoTrue's, so it reads that
 * stamp as the future and answers `JWT issued at future`. The token is
 * perfectly valid; the two services just disagree about what time it is, and
 * they stop disagreeing within a second or two.
 *
 * Left alone it takes down whole pages. A refresh lands on whatever route the
 * operator happened to open, that route's layout queries as the user, the query
 * throws, and the segment 500s — an hourly coin flip, since the token lives an
 * hour and every request through the proxy is a chance to renew it.
 *
 * Retrying is safe for any method, including writes: the request is turned away
 * at the door, so nothing behind it ran. Retrying is also honest about real
 * problems — a badly wrong clock exhausts the attempts and the caller still
 * sees the original error, exactly as before.
 */

/** Backoff between attempts. Bounded: past a couple of seconds it is not skew. */
const RETRY_DELAYS_MS = [300, 1200];

/**
 * Matched on the message rather than the status because the status PostgREST
 * pairs with a rejected token has moved between releases, while this phrase is
 * the one it has always used for a clock it disagrees with.
 */
function isClockSkewRejection(body: string) {
  return body.toLowerCase().includes("issued at future");
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithClockSkewRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(input, init);

    if (response.ok || attempt >= RETRY_DELAYS_MS.length) {
      return response;
    }

    // Clone before reading: if this turns out not to be skew, the caller still
    // needs the body intact.
    const body = await response.clone().text();
    if (!isClockSkewRejection(body)) {
      return response;
    }

    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}
