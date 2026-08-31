const { withRetry, parseRetryAfter } = require("./utils");

/**
 * The Movie DB is contacted hundreds of times over a single venue's transform,
 * and it drops connections under load: a `read ECONNRESET` part way through
 * matching is a normal event rather than a sign anything is wrong.
 *
 * The wrapper this replaces retried exactly once, a flat 60 seconds later. Two
 * unlucky resets in a row therefore took out a venue - and because each venue
 * is a step in a shared group job, it took every venue after it in that group
 * with it, along with the group's transformed output for that run. A retry
 * budget that only covers a single blip is not a retry budget.
 *
 * So: a window wide enough to sit out a dip, spent only on the failures that
 * could plausibly answer differently next time.
 */

// 30s, 60s, 120s, 240s across five attempts - about 7.5 minutes of waiting.
// withRetry jitters each wait, which matters here because ~10 venue jobs run
// concurrently against the same API key: an unjittered fixed cadence has them
// all retry in lockstep and rebuild the load spike they are backing off from.
const RETRY_CONFIG = { retries: 4, delayMs: 30_000, backoffFactor: 2 };

// Axios reports a request that never got an answer - ECONNRESET, ETIMEDOUT, a
// socket hang up - with no `response` at all, and those are exactly the
// failures worth another attempt. Of the requests that did get an answer, only
// a rate limit and a server-side error can come back differently; a 404 (the
// movie has been deleted since search last listed it) or a 401 (the key is
// wrong) will not, so retrying those would spend the whole budget to arrive at
// the same error seven minutes later.
const isRetryable = (error) => {
  const status = error.response?.status;
  if (status === undefined) return true;
  return status === 429 || status >= 500;
};

// The Movie DB says how long to wait when it rate limits us, and honouring
// that beats guessing - withRetry prefers `retryAfterMs` over its own backoff.
const getRetryAfterMs = (error) => {
  const headers = error.response?.headers;
  if (!headers) return undefined;
  // Axios hands back an AxiosHeaders instance (lowercased own keys, plus a
  // `get`), but a stubbed client may hand back a plain object.
  return parseRetryAfter(
    headers.get?.("retry-after") ?? headers["retry-after"],
  );
};

const withMovieDbRetry = (label, callback) =>
  withRetry(
    async () => {
      try {
        return await callback();
      } catch (error) {
        error.retryAfterMs ??= getRetryAfterMs(error);
        throw error;
      }
    },
    {
      ...RETRY_CONFIG,
      // The call is named in the label so a retry line says which lookup is
      // struggling; without it a venue full of retries logs an untraceable
      // wall of identical warnings.
      label: `themoviedb ${label}`,
      shouldRetry: isRetryable,
    },
  );

// A movie that search still lists but that has since been deleted answers 404
// on lookup. That is the one failure a caller can reasonably carry on from -
// any other means the data is missing because we could not reach the API,
// which is not the same thing and must not be read as an answer.
const isMissingMovieDbEntry = (error) => error.response?.status === 404;

module.exports = { withMovieDbRetry, isMissingMovieDbEntry };
