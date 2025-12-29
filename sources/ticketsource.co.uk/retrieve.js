const { subMonths } = require("date-fns");
const { fetchJson } = require("../../common/utils");
const attributes = require("./attributes");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");

// Algolia API configuration
const ALGOLIA_CONFIG = {
  appId: "LH632P1UP5",
  apiKey: "239323e27e42c7e84a9f43482ff0d662",
  indexName: "dev_EVENT",
  baseUrl: "https://lh632p1up5-dsn.algolia.net/1/indexes",
};

function buildSearchParams(page, overrides = {}) {
  const oneMonthAgo = subMonths(new Date(), 1);
  const oneMonthAgoTimestamp = Math.floor(oneMonthAgo.getTime() / 1000);
  const currentTimestamp = Math.floor(Date.now() / 1000);

  return {
    query: "",
    removeStopWords: true,
    page,
    getRankingInfo: true,
    facets: "*",
    filters: `category:'film'`,
    numericFilters: [
      `timestamp >= ${oneMonthAgoTimestamp}`,
      `filterTimestamp >= ${currentTimestamp}`,
    ],
    ...overrides,
  };
}

function buildSearchParamsForGeoFilter({ page = 0 } = {}) {
  return buildSearchParams(page, {
    aroundLatLng: "51.49028, -0.12324", // Center point of London
    aroundRadius: "24140", // 25km
    aroundPrecision: "24140",
  });
}

function buildSearchParamsForLocationFilter({ page = 0 } = {}) {
  return buildSearchParams(page, {
    filters: `category:'film' AND location:'london'`,
  });
}

function buildSearchParamsForNtLive({ page = 0 } = {}) {
  return buildSearchParams(page, {
    filters: `category:'theatre'`,
    query: "NT Live",
  });
}

function buildSearchParamsForExhibitionOnScreen({ page = 0 } = {}) {
  return buildSearchParams(page, {
    filters: `category:'theatre'`,
    query: "Exhibition On Screen",
  });
}

async function fetchAlgoliaEvents(params) {
  const urlParameters = new URLSearchParams({
    "x-algolia-agent": "Algolia for JavaScript (3.35.1); Browser",
    "x-algolia-application-id": ALGOLIA_CONFIG.appId,
    "x-algolia-api-key": ALGOLIA_CONFIG.apiKey,
  });
  const url = `${ALGOLIA_CONFIG.baseUrl}/${ALGOLIA_CONFIG.indexName}/query?${urlParameters}`;

  const body = JSON.stringify({
    params: new URLSearchParams(params).toString(),
  });

  return fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

/**
 * Fetch all pages of events from TicketSource via Algolia API
 */
async function retrieveFilterEvents(buildSearchParamsForFilter) {
  const movieListPages = [];
  const searchParams = buildSearchParamsForFilter({ page: 0 });
  const firstPage = await fetchAlgoliaEvents(searchParams);
  movieListPages.push(firstPage);

  const totalPages = firstPage.nbPages;
  let currentPage = 1; // Continue from the second page
  while (currentPage + 1 <= totalPages) {
    const pageParams = buildSearchParamsForFilter({ page: currentPage });
    const pageResponse = await fetchAlgoliaEvents(pageParams);
    movieListPages.push(pageResponse);
    currentPage++;
  }

  return movieListPages;
}

async function retrieve() {
  const movieListPages = [].concat(
    await retrieveFilterEvents(buildSearchParamsForGeoFilter),
    await retrieveFilterEvents(buildSearchParamsForLocationFilter),
    await retrieveFilterEvents(buildSearchParamsForNtLive),
    await retrieveFilterEvents(buildSearchParamsForExhibitionOnScreen),
  );

  const allHits = movieListPages
    .flatMap(({ hits }) => hits)
    // Remove duplicates; as we're running more than one search, it's possible
    // to get the same values back for both.
    .reduce((acc, hit) => {
      const missingValue = !acc.find((item) => item.objectID === hit.objectID);
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
