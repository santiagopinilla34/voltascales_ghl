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
 * problems — a clock that is wrong rather than merely a beat behind exhausts
 * the budget and the caller still sees the original error, exactly as before.
 *
 * The wait is measured, not guessed. A fixed ladder has to pick a number, and
 * the number it picked (two attempts, 1.5s of patience in total) was smaller
 * than the skew actually seen on a cold load — so the retries ran, all of them
 * failed, and the page fell over anyway, which looks exactly like no retry at
 * all. Both halves of the answer are already in hand on the failing exchange:
 * the token says when it was issued and the response says what time the
 * responder thinks it is, and the difference is precisely how long to wait.
 */

/**
 * Total time we are willing to spend waiting out a disagreement about the
 * clock. Past this it is not drift — it is a machine whose time is wrong, and
 * no amount of waiting fixes that. Generous, because the alternative to
 * waiting is a broken page.
 */
const MAX_WAIT_MS = 5_000;

/**
 * Ceiling on requests, not just on time. The measured wait shrinks as the two
 * clocks converge, so a rejection that keeps coming back after the skew should
 * have cleared leaves the loop retrying at the floor — seventeen requests in
 * five seconds, in the shape of a small denial-of-service aimed at a backend
 * that is already unhappy. Whatever that failure is, it is no longer the
 * half-second of drift this exists for, and hammering will not resolve it.
 */
const MAX_ATTEMPTS = 4;

/**
 * Used when the exchange doesn't yield a measurement — no `Date` header, or a
 * token whose `iat` can't be read. Same shape of guess as before, one rung
 * longer.
 */
const FALLBACK_DELAYS_MS = [300, 1200, 2000];

/**
 * Floor on any single wait. A measured skew arrives rounded down to the second
 * (`Date` has no sub-second precision), so a measurement of "zero" can still be
 * most of a second of real disagreement, and retrying instantly would just
 * spend an attempt to learn nothing.
 */
const MIN_DELAY_MS = 300;

/** Covers `Date`'s second-granularity rounding plus a little jitter. */
const CLOCK_MARGIN_MS = 500;

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

/** The headers the request actually went out with, from either call shape. */
function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  if (init?.headers) return new Headers(init.headers);
  if (input instanceof Request) return input.headers;
  return new Headers();
}

/**
 * The `iat` claim of the bearer token, in epoch seconds.
 *
 * Reads the payload without verifying the signature, which is fine for the one
 * thing it is used for: deciding how long to sleep. A forged `iat` buys an
 * attacker a delay in their own request and nothing else — PostgREST is still
 * the only party that decides whether the token is good.
 */
function tokenIssuedAt(headers: Headers): number | null {
  const authorization = headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const payload = authorization.slice("Bearer ".length).split(".")[1];
  if (!payload) return null;

  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { iat } = JSON.parse(json) as { iat?: unknown };
    return typeof iat === "number" ? iat : null;
  } catch {
    // Not a JWT, or not one we can read. The caller falls back to guessing.
    return null;
  }
}

/**
 * How far in the future the token looks from where the responder is standing,
 * in milliseconds, or null when the exchange doesn't say.
 */
function measureSkewMs(response: Response, headers: Headers): number | null {
  const date = response.headers.get("date");
  if (!date) return null;

  const issuedAt = tokenIssuedAt(headers);
  if (issuedAt === null) return null;

  const responderNow = Date.parse(date);
  if (Number.isNaN(responderNow)) return null;

  return issuedAt * 1000 - responderNow + CLOCK_MARGIN_MS;
}

export async function fetchWithClockSkewRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let slept = 0;

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(input, init);

    if (response.ok) return response;

    // Clone before reading: if this turns out not to be skew, the caller still
    // needs the body intact.
    const body = await response.clone().text();
    if (!isClockSkewRejection(body)) return response;

    const measured = measureSkewMs(response, requestHeaders(input, init));
    const guess =
      FALLBACK_DELAYS_MS[Math.min(attempt, FALLBACK_DELAYS_MS.length - 1)];
    const delay = Math.max(MIN_DELAY_MS, measured ?? guess);

    // Out of patience. The caller sees the original rejection, exactly as it
    // would have without any of this.
    if (attempt + 1 >= MAX_ATTEMPTS || slept + delay > MAX_WAIT_MS) {
      return response;
    }

    await sleep(delay);
    slept += delay;
  }
}
