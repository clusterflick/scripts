const { fetchWithRetry, sleep, withJitter } = require("./utils");
const {
  BOT_CHALLENGE_TEXT,
  isBotChallengeFetchResponse,
  isBotChallengeResponse,
} = require("./bot-challenge");

// Shared plumbing for the health probes under `scripts/health`. A probe asks a
// chain's listing endpoint what is currently published and records the answer;
// it never opens a per-title page, which is where a retrieve spends its time.
// The point is a cheap, repeatable observation, so it has to stay cheap enough
// to run hourly.

// Deliberately shorter than a retrieve's 30s default. An hourly probe that
// stalls on a wedged chain reports late, and a late observation of a publish is
// worth less than a prompt failure.
const PROBE_RETRY = { retries: 1, delayMs: 5_000 };

// Why a venue has no counts. A challenge, or a venue with nothing on, is an
// observation
// about the source and worth keeping; only the failure kinds mean something is
// wrong with us. Which kinds fail the job is the caller's call - see
// scripts/health.
class ProbeFailure extends Error {
  constructor(reason) {
    super(reason.message ?? reason.kind);
    this.reason = reason;
  }
}

const probeError = (message) =>
  new ProbeFailure({ kind: "probe-error", message });

// Fetch, and classify anything that isn't the content we asked for. Unlike
// `fetchJson`, a non-ok response is not simply thrown: a bot challenge is an
// observation the log exists to keep, and telling it apart from an outage needs
// the response itself rather than just its status.
const probeFetch = async (url, options = {}) => {
  const response = await fetchWithRetry(url, options, PROBE_RETRY);

  if (isBotChallengeFetchResponse(response)) {
    throw new ProbeFailure({
      kind: "bot-challenge",
      via: "cf-mitigated",
      status: response.status,
    });
  }

  const body = await response.text();
  return { response, body };
};

// Classify a body that has already failed to be the content we wanted. Kept
// separate because BOT_CHALLENGE_TEXT matches phrases ("Just a moment") that a
// film title could contain, so it must never be run against a good listing.
const classifyFailure = (url, response, body) => {
  if (BOT_CHALLENGE_TEXT.test(body)) {
    return new ProbeFailure({
      kind: "bot-challenge",
      via: "response-text",
      status: response.status,
    });
  }
  return probeError(
    `${url} responded ${response.status} ${response.statusText} without a listing`,
  );
};

// Why a page didn't yield what was asked of it. Returned rather than thrown so
// `getPage` rethrows it without caching the failure.
//
// The `cf-mitigated` header is the definitive challenge signal, but it does not
// always reach us on the navigation response - an observed Curzon challenge
// arrived with only the interstitial's own markup to go on, and was reported as
// a probe error, which fails the job instead of recording that we were blocked.
// The page text is the fallback, and is why BOT_CHALLENGE_TEXT exists.
const classifyPage = async (page, response, message) => {
  const status = response?.status() ?? null;
  if (isBotChallengeResponse(response)) {
    return new ProbeFailure({
      kind: "bot-challenge",
      via: "cf-mitigated",
      status,
    });
  }
  const content = await page.content().catch(() => "");
  if (BOT_CHALLENGE_TEXT.test(content)) {
    return new ProbeFailure({
      kind: "bot-challenge",
      via: "response-text",
      status,
    });
  }
  return probeError(message);
};

const probeJson = async (url, options) => {
  const { response, body } = await probeFetch(url, options);
  if (response.ok) {
    try {
      return JSON.parse(body);
    } catch {
      // Fall through: a 200 that isn't JSON is an interstitial or an error
      // page, not a listing.
    }
  }
  throw classifyFailure(url, response, body);
};

// Like `probeText`, but also hands back the cookies the response set. A chain
// whose second call is CSRF-gated needs both the token from the page and the
// session that token was issued against.
const probeDocument = async (url, options) => {
  const { response, body } = await probeFetch(url, options);
  if (!response.ok) throw classifyFailure(url, response, body);
  return {
    body,
    cookie: (response.headers.getSetCookie?.() ?? [])
      .map((value) => value.split(";")[0])
      .join("; "),
  };
};

const probeText = async (url, options) => {
  const { response, body } = await probeFetch(url, options);
  if (response.ok) return body;
  throw classifyFailure(url, response, body);
};

// A challenge is usually transient - Cloudflare hands out a clearance and the
// next attempt goes through - so it is worth waiting once before recording it.
// Only challenges are retried: an unknown id or a broken parse will fail again
// identically, and retrying those just delays the cycle for nothing.
//
// Wrap the whole unit that shares a request, not the request alone. For the
// browser probes that means the call that opens the session, so the retry gets a
// fresh browser - a challenged context stays challenged, and reusing it would
// spend the delay to be refused again.
const CHALLENGE_RETRY_MS = 60_000;

const withChallengeRetry = async (fn, label, retries = 1) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (error.reason?.kind !== "bot-challenge" || attempt >= retries)
        throw error;
      const wait = withJitter(CHALLENGE_RETRY_MS);
      console.log(
        ` ! - ${label} was challenged, retrying in ${Math.round(wait / 1000)}s ...`,
      );
      await sleep(wait);
    }
  }
};

// Collects one cycle's rows. Nothing is stamped until `finalise`, so every row
// carries the cycle's final totals rather than the running values at the moment
// it was built - `durationMs` and `requests` describe the observation, not the
// venue, and must not be summed across rows.
const startObservation = (granularity) => {
  const at = new Date().toISOString();
  const start = Date.now();
  let requests = 0;

  return {
    countRequest: () => (requests += 1),
    // An unrecognised error is the probe's own failure; a ProbeFailure already
    // carries the reason it was classified as.
    reasonFor: (error) =>
      error.reason ?? { kind: "probe-error", message: error.message },
    finalise: (results) =>
      results.map(({ venue, counts = null, byDate = null, reason = null }) => ({
        at,
        venue,
        durationMs: Date.now() - start,
        requests,
        granularity,
        counts,
        byDate,
        reason,
      })),
  };
};

module.exports = {
  ProbeFailure,
  probeError,
  probeJson,
  probeText,
  probeDocument,
  classifyPage,
  withChallengeRetry,
  startObservation,
};
