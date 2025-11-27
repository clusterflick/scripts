const { subMonths } = require("date-fns");
const { fetchJson } = require("../../common/utils");

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
async function retrieveGeoFilterEvents() {
  const movieListPages = [];
  const searchParams = buildSearchParamsForGeoFilter({ page: 0 });
  const firstPage = await fetchAlgoliaEvents(searchParams);
  movieListPages.push(firstPage);

  const totalPages = firstPage.nbPages;
  let currentPage = 1; // Continue from the second page
  while (currentPage + 1 <= totalPages) {
    const pageParams = buildSearchParamsForGeoFilter({ page: currentPage });
    const pageResponse = await fetchAlgoliaEvents(pageParams);
    movieListPages.push(pageResponse);
    currentPage++;
  }

  return movieListPages;
}

async function retrieveLocationFilterEvents() {
  const movieListPages = [];
  const searchParams = buildSearchParamsForLocationFilter({ page: 0 });
  const firstPage = await fetchAlgoliaEvents(searchParams);
  movieListPages.push(firstPage);

  const totalPages = firstPage.nbPages;
  let currentPage = 1; // Continue from the second page
  while (currentPage + 1 <= totalPages) {
    const pageParams = buildSearchParamsForLocationFilter({
      page: currentPage,
    });
    const pageResponse = await fetchAlgoliaEvents(pageParams);
    movieListPages.push(pageResponse);
    currentPage++;
  }

  return movieListPages;
}

async function retrieve() {
  const movieListPages = [].concat(
    await retrieveGeoFilterEvents(),
    await retrieveLocationFilterEvents(),
  );
  return { movieListPages };
}

module.exports = retrieve;
