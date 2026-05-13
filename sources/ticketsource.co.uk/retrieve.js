const { subMonths } = require("date-fns");
const attributes = require("./attributes");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");

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
  const firstBody = buildSearchBodyForFilter({ offset: 0 });
  const firstPage = await fetchMeilisearchEvents(page, firstBody);
  movieListPages.push(firstPage);

  const { estimatedTotalHits: totalHits } = firstPage;
  if (totalHits === undefined) {
    throw new Error("Missing estimatedTotalHits in Meilisearch response");
  }
  let currentOffset = HITS_PER_PAGE;
  while (currentOffset < totalHits) {
    const pageBody = buildSearchBodyForFilter({ offset: currentOffset });
    const pageResponse = await fetchMeilisearchEvents(page, pageBody);
    movieListPages.push(pageResponse);
    currentOffset += HITS_PER_PAGE;
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
  for (const hit of allHits) {
    const { locationSlug, venueSlug, eventSlug, eventHash } = hit;
    const url = `${attributes.domain}/whats-on/${locationSlug}/${venueSlug}/${eventSlug}/${eventHash}`;
    const cacheKey = `ticketsource-${eventSlug}-${eventHash}`;
    moviePages[eventHash] = await getPageWithPlaywright(
      url,
      cacheKey,
      async (page) => {
        await page.waitForLoadState();
        await page.locator("#js-navigation-wrapper").waitFor({ strict: false });
        return await page.content();
      },
    );
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;
