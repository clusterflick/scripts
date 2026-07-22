const { subMonths } = require("date-fns");
const attributes = require("./attributes");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");
const { withRetry } = require("../../common/utils");

// TicketSource sits behind a "checking your connection" bot challenge that
// triggers when event pages are requested too quickly back-to-back. Space the
// requests out and, if we do get blocked, back off and try again rather than
// failing the whole run on a single page.
const REQUEST_DELAY_MS = 3_000;
const RETRY_DELAY_MS = 60_000;

// Visible text on TicketSource's Cloudflare bot-challenge page. Used to fail
// fast rather than waiting the full timeout for content that will never load.
const CHALLENGE_TEXT =
  /Checking if your connection to the TicketSource website is secure/i;

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

async function fetchMeilisearchEvents(page, body) {
  const url = `${MEILISEARCH_CONFIG.baseUrl}/indexes/${MEILISEARCH_CONFIG.indexName}/search`;
  const apiKey = MEILISEARCH_CONFIG.apiKey;

  return page.evaluate(
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

async function retrieve() {
  const timestampFilter = buildTimestampFilter();

  const movieListPages = await getPageWithPlaywright(
    `${attributes.domain}/whats-on?category=film`,
    "ticketsource-events-list",
    async (page) => {
      await page.waitForLoadState("domcontentloaded");

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
    },
  );

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
    const { locationSlug, venueSlug, eventSlug, eventHash } = hit;
    const url = `${attributes.domain}/whats-on/${locationSlug}/${venueSlug}/${eventSlug}/${eventHash}`;
    const cacheKey = `ticketsource-${eventSlug}-${eventHash}`;

    pageNumber += 1;
    console.log(
      `    - [${Date.now()}] (${pageNumber}/${allHits.length}) Getting data for ${url} ...`,
    );

    moviePages[eventHash] = await withRetry(
      () =>
        getPageWithPlaywright(url, cacheKey, async (page) => {
          await page.waitForLoadState();
          // Go gently - space requests out so we're less likely to trip the
          // bot challenge. This only runs on a real fetch (cache miss), so
          // cached replays in tests aren't delayed.
          await page.waitForTimeout(REQUEST_DELAY_MS);

          const challengeLocator = page.getByText(CHALLENGE_TEXT);
          // Anchor on the event content itself rather than the site header -
          // TicketSource serves promoter-branded pages with a stripped-down
          // header, so navigation markup isn't a reliable signal.
          const validContentLocator = page.locator("#performanceInfo");

          // Whichever resolves first - the bot challenge or the real page -
          // settle as soon as one is present rather than waiting out the
          // timeout on a challenge page that will never render the content.
          await challengeLocator
            .or(validContentLocator)
            .first()
            .waitFor({ state: "attached" });

          // Throw (don't return) so the result isn't cached and withRetry can
          // back off and try again with a fresh browser session.
          if (await challengeLocator.isVisible()) {
            throw new Error(`Bot challenge page detected at ${url}`);
          }

          return await page.content();
        }),
      { retries: 2, delayMs: RETRY_DELAY_MS, label: `Retrieving ${url}` },
    );
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;
