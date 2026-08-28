const { subMonths } = require("date-fns");
const attributes = require("./attributes");
const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const {
  BOT_CHALLENGE_TEXT,
  isBotBlockText,
  isBotChallengeResponse,
} = require("../../common/bot-challenge");
const { withRetry, withJitter } = require("../../common/utils");

// TicketSource sits behind a Cloudflare bot challenge, on both the main site and
// the search API. Space the requests out and, if we do get blocked, back off and
// try again rather than failing the whole run on a single page. A fixed interval
// is itself a detectable signature, so jitter each wait rather than knocking on
// the door at a metronomic 100 times in a row.
//
// The delay is load-bearing, not superstition: measured 2026-08-28, event pages
// requested back-to-back with no wait got a 429 on the sixth. A page itself only
// costs ~1.5s, so nearly all of this venue's runtime is this delay by design.
const REQUEST_DELAY_MS = 6_000;
const RETRY_DELAY_MS = 60_000;

// See the note in `retrieve()` — `geoip` is deliberately off for this venue.
const SESSION_OPTIONS = { launch: { geoip: false } };

// Cloudflare's interstitial runs its check and reloads itself once it passes, so
// being handed one isn't fatal. This is how long we give it to hand over to the
// real page before treating the request as blocked.
//
// Sized for the slowest combination we actually run, not the fastest. A Mac
// solves this in ~3s, which is what the old 30s was quietly sized against — but
// the fleet's Pi 4s are handed a harder challenge tier (Cloudflare's stock
// "Just a moment..." rather than TicketSource's own branded page, which is what
// a low-reputation IP gets) and solve it far more slowly. Measured 2026-08-28 on
// `self-hosted-pi4-1`: attempt 1 ran out of clock at 30s, attempt 2 cleared the
// same gate minutes later on the same commit. 90s matches the budget Close-Up
// already gets on these same boxes via the context default, and it is only ever
// spent while a challenge is genuinely in flight.
const CHALLENGE_CLEAR_TIMEOUT_MS = 90_000;

// Meilisearch API configuration
const MEILISEARCH_CONFIG = {
  baseUrl: "https://search.ticketsource.com",
  indexName: "events_PROD",
  apiKey: "8a9086965b57cfe51cf3bcdf05f9380b4673cae831135a2eb48afcbbac9d991b",
};

const HITS_PER_PAGE = 100;

function buildTimestampFilter() {
  const oneMonthAgo = subMonths(new Date(), 1);
  const oneMonthAgoTimestamp = Math.floor(oneMonthAgo.getTime() / 1000);
  const currentTimestamp = Math.floor(Date.now() / 1000);
  return `timestamp >= ${oneMonthAgoTimestamp} AND filterTimestamp >= ${currentTimestamp}`;
}

function buildSearchBody(offset, filter, overrides = {}) {
  return {
    q: "",
    filter,
    facets: ["genre", "category", "location"],
    sort: ["timestamp:asc"],
    limit: HITS_PER_PAGE,
    offset,
    showRankingScore: true,
    showRankingScoreDetails: true,
    ...overrides,
  };
}

function buildSearchBodyForGeoFilter(timestampFilter, { offset = 0 } = {}) {
  const lat = 51.49028;
  const lng = -0.12324;
  const radiusMeters = 24140; // ~15 miles, center of London
  const filter = `${timestampFilter} AND category = "film" AND _geoRadius(${lat}, ${lng}, ${radiusMeters})`;
  return buildSearchBody(offset, filter, {
    sort: [`timestamp:asc`, `_geoPoint(${lat}, ${lng}):asc`],
  });
}

function buildSearchBodyForLocationFilter(
  timestampFilter,
  { offset = 0 } = {},
) {
  const filter = `${timestampFilter} AND category = "film" AND location = "london"`;
  return buildSearchBody(offset, filter);
}

function buildSearchBodyForNtLive(timestampFilter, { offset = 0 } = {}) {
  const filter = `${timestampFilter} AND category = "theatre"`;
  return buildSearchBody(offset, filter, { q: "NT Live" });
}

function buildSearchBodyForExhibitionOnScreen(
  timestampFilter,
  { offset = 0 } = {},
) {
  const filter = `${timestampFilter} AND category = "theatre"`;
  return buildSearchBody(offset, filter, { q: "Exhibition On Screen" });
}

// A document we can actually use: served to us rather than withheld, and not
// labelled by Cloudflare as a challenge.
const isClearResponse = (response) =>
  response?.status() === 200 && !isBotChallengeResponse(response);

// Cloudflare answers a blocked request with `cf-mitigated: challenge` and an
// interstitial that runs its check and reloads the page. Wait for that reload to
// come back clean rather than failing on the interstitial we were handed.
//
// The signal has to be a good response arriving, not the interstitial going
// away. The interstitial is briefly absent from the DOM during every reload it
// makes - including the ones that land on another interstitial - so treating its
// absence as success reports a cleared page that never cleared.
async function waitForChallengeToClear(page, response, url) {
  if (isClearResponse(response)) return;

  try {
    await page.waitForResponse(
      (candidate) => {
        const request = candidate.request();
        return (
          // Only the page's own navigations count. Cloudflare runs its check in
          // a sub-frame whose requests come back perfectly clean while the main
          // frame is still sitting on the interstitial.
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame() &&
          isClearResponse(candidate)
        );
      },
      { timeout: CHALLENGE_CLEAR_TIMEOUT_MS },
    );
  } catch {
    // Throw (don't return) so the result isn't cached and the caller can back
    // off and try again with a fresh page.
    //
    // Separate the two refusals before reporting. A challenge we failed to
    // solve is worth retrying; an outright block is not, and calling it a
    // challenge sends the next person looking for a puzzle that was never
    // offered. Both arrive as a timeout here, so the page body is the only
    // thing that tells them apart.
    if (isBotBlockText(await page.content().catch(() => null))) {
      throw new Error(
        `Blocked outright (not challenged) at ${url} — the request was refused, ` +
          `not scored. Check the Camoufox launch options before assuming the site changed.`,
      );
    }
    throw new Error(`Bot challenge page detected at ${url}`);
  }
}

// The real listing page carries its own Meilisearch credentials in this tag, so
// its presence means both "the challenge is behind us" and "this document is the
// one that talks to the search API". The challenge pages never carry it.
const APP_CONFIG_SELECTOR = "script#app-config";

// Clearing a challenge is a navigation, and `waitForChallengeToClear` returns
// the moment the clean *response* arrives — a beat before the new document
// commits. Anything evaluated in that window dies with "Execution context was
// destroyed". That isn't flakiness to be retried away: it reproduced 3/3 locally
// and took out the first CI attempt. Waiting on an element of the *new* document
// is what actually settles it, and `waitForSelector` is navigation-resilient, so
// it re-arms if the page moves again underneath.
const waitForPageToSettle = (page) =>
  page.waitForSelector(APP_CONFIG_SELECTOR, { state: "attached" });

// Cloudflare can re-check partway through the four filter searches, which is the
// same navigation hazard arriving later in the run. Settle and repeat the call
// rather than losing every page retrieved so far.
const CONTEXT_LOST = /Execution context was destroyed|frame was detached/i;
const EVALUATE_RETRIES = 2;

async function evaluateOnSettledPage(page, pageFunction, argument) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate(pageFunction, argument);
    } catch (error) {
      if (attempt >= EVALUATE_RETRIES || !CONTEXT_LOST.test(error.message)) {
        throw error;
      }
      await waitForPageToSettle(page);
    }
  }
}

async function fetchMeilisearchEvents(page, body) {
  const url = `${MEILISEARCH_CONFIG.baseUrl}/indexes/${MEILISEARCH_CONFIG.indexName}/search`;
  const apiKey = MEILISEARCH_CONFIG.apiKey;

  // Cross-origin to the search host, which is behind its own Cloudflare rule.
  // When that rule fires it answers without CORS headers, so the block reaches
  // us as an opaque "Failed to fetch" rather than a status we can report on.
  return evaluateOnSettledPage(
    page,
    async ({ url, body, apiKey }) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response.json();
    },
    { url, body, apiKey },
  );
}

async function retrieveFilterEvents(page, buildSearchBodyForFilter) {
  const movieListPages = [];

  // Page until a request returns fewer than a full page of hits. We deliberately
  // do NOT use Meilisearch's `estimatedTotalHits` as the termination condition:
  // it under-reports (it can come back exactly equal to the page size even when
  // more results exist), which silently drops the furthest-future events because
  // results are sorted by ascending timestamp.
  let currentOffset = 0;
  while (true) {
    const pageBody = buildSearchBodyForFilter({ offset: currentOffset });
    const pageResponse = await fetchMeilisearchEvents(page, pageBody);
    if (!Array.isArray(pageResponse.hits)) {
      throw new Error("Missing hits array in Meilisearch response");
    }
    movieListPages.push(pageResponse);

    if (pageResponse.hits.length < HITS_PER_PAGE) break;
    currentOffset += HITS_PER_PAGE;

    // Meilisearch caps retrievable results at `maxTotalHits` (default 1000), past
    // which a request returns an empty page and the loop stops anyway — this is
    // just a guard against an unbounded loop if the API ever misbehaves.
    if (currentOffset > 10_000) {
      throw new Error(
        `Pagination exceeded ${currentOffset} results for a single filter — aborting to avoid an unbounded loop`,
      );
    }
  }

  return movieListPages;
}

async function retrieveEventsList(getPage, timestampFilter) {
  const url = `${attributes.domain}/whats-on?category=film`;

  return getPage(url, "ticketsource-events-list", async (page, response) => {
    await page.waitForLoadState("domcontentloaded");
    await waitForChallengeToClear(page, response, url);
    // Not redundant with the wait above: that one confirms a clean response was
    // served, this one confirms the document it describes has actually arrived.
    await waitForPageToSettle(page);

    return [].concat(
      await retrieveFilterEvents(page, (opts) =>
        buildSearchBodyForGeoFilter(timestampFilter, opts),
      ),
      await retrieveFilterEvents(page, (opts) =>
        buildSearchBodyForLocationFilter(timestampFilter, opts),
      ),
      await retrieveFilterEvents(page, (opts) =>
        buildSearchBodyForNtLive(timestampFilter, opts),
      ),
      await retrieveFilterEvents(page, (opts) =>
        buildSearchBodyForExhibitionOnScreen(timestampFilter, opts),
      ),
    );
  });
}

const getEventUrl = ({ locationSlug, venueSlug, eventSlug, eventHash }) =>
  `${attributes.domain}/whats-on/${locationSlug}/${venueSlug}/${eventSlug}/${eventHash}`;

function retrieveEventPage(getPage, hit) {
  const url = getEventUrl(hit);
  const cacheKey = `ticketsource-${hit.eventSlug}-${hit.eventHash}`;

  return withRetry(
    () =>
      getPage(url, cacheKey, async (page, response) => {
        await page.waitForLoadState();
        // Go gently - space requests out so we're less likely to trip the
        // bot challenge. This only runs on a real fetch (cache miss), so
        // cached replays in tests aren't delayed.
        await page.waitForTimeout(withJitter(REQUEST_DELAY_MS));

        // Anchor on the event content itself rather than the site header -
        // TicketSource serves promoter-branded pages with a stripped-down
        // header, so navigation markup isn't a reliable signal.
        const contentLocator = page.locator("#performanceInfo");

        // Whichever resolves first - the bot challenge or the real page -
        // settle as soon as one is present rather than waiting out the
        // timeout on a challenge page that will never render the content.
        await page
          .getByText(BOT_CHALLENGE_TEXT)
          .or(contentLocator)
          .first()
          .waitFor({ state: "attached" });

        // A page showing its content is past any challenge, whatever we were
        // handed on arrival — so only go looking for one when it isn't there.
        if ((await contentLocator.count()) === 0) {
          await waitForChallengeToClear(page, response, url);
          await contentLocator.waitFor({ state: "attached" });
        }

        return await page.content();
      }),
    { retries: 2, delayMs: RETRY_DELAY_MS, label: `Retrieving ${url}` },
  );
}

async function retrieve() {
  const timestampFilter = buildTimestampFilter();

  // One browser for the whole run. The search API and the event pages are behind
  // Cloudflare on separate hosts, and a shared context holds on to each host's
  // clearance cookie for every request that follows instead of starting cold
  // each time — which, over a hundred event pages, is itself a bot signature.
  //
  // Camoufox rather than the stealth-Chromium helper: as of 2026-08-28 the
  // challenge here hardened to the point that stealth Chromium sits on the
  // interstitial indefinitely (measured: 60s, never solved, six consecutive CI
  // failures across two runners). Camoufox solves it in a few seconds.
  //
  // `geoip: false` is load-bearing and NOT a tidy-up — leave it alone. With
  // Camoufox's default `geoip: true`, TicketSource skips the challenge entirely
  // and hard-blocks the request ("Your web browser has been blocked..."), which
  // is strictly worse than the stealth Chromium we're replacing. Measured on the
  // same IP within the same minute, repeatedly, headless and headed:
  //   geoip on  -> blocked outright, no `cf-mitigated` header, no puzzle offered
  //   geoip off -> challenge served, solved, real page in ~5s
  // `humanize` is innocent and stays on. This is venue-specific: Close-Up runs
  // the same helper with geoip on and is fine, so the override lives here rather
  // than changing the shared default.
  return withCamoufoxSession(async (getPage) => {
    const movieListPages = await retrieveEventsList(getPage, timestampFilter);

    const allHits = movieListPages
      .flatMap(({ hits }) => hits)
      // Remove duplicates; as we're running more than one search, it's possible
      // to get the same values back for both.
      .reduce((acc, hit) => {
        const missingValue = !acc.find(
          (item) => item.performanceId === hit.performanceId,
        );
        if (missingValue) acc.push(hit);
        return acc;
      }, []);

    const moviePages = {};
    console.log(`    - Found ${allHits.length} event pages to retrieve`);
    let pageNumber = 0;
    for (const hit of allHits) {
      pageNumber += 1;
      console.log(
        `    - [${Date.now()}] (${pageNumber}/${allHits.length}) Getting data for ${getEventUrl(hit)} ...`,
      );

      moviePages[hit.eventHash] = await retrieveEventPage(getPage, hit);
    }

    return { movieListPages, moviePages };
  }, SESSION_OPTIONS);
}

module.exports = retrieve;
