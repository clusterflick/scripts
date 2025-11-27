const { subMonths } = require("date-fns");
const { fetchJson } = require("../../common/utils");

// Algolia API configuration
const ALGOLIA_CONFIG = {
  appId: "LH632P1UP5",
  apiKey: "239323e27e42c7e84a9f43482ff0d662",
  indexName: "dev_EVENT",
  baseUrl: "https://lh632p1up5-dsn.algolia.net/1/indexes",
};

/**
 * Build Algolia search parameters
 */
function buildSearchParams({
  category = "film",
  location = "london",
  page = 0,
} = {}) {
  const oneMonthAgo = subMonths(new Date(), 1);
  const oneMonthAgoTimestamp = Math.floor(oneMonthAgo.getTime() / 1000);
  const currentTimestamp = Math.floor(Date.now() / 1000);

  return {
    query: "",
    removeStopWords: true,
    page,
    getRankingInfo: true,
    facets: "*",
    filters: `category:'${category}' AND location:'${location}'`,
    numericFilters: [
      `timestamp >= ${oneMonthAgoTimestamp}`,
      `filterTimestamp >= ${currentTimestamp}`,
    ],
  };
}

/**
 * Fetch events from Algolia API
 */
async function fetchAlgoliaEvents(params) {
  const url = `${ALGOLIA_CONFIG.baseUrl}/${ALGOLIA_CONFIG.indexName}/query`;

  const headers = {
    "x-algolia-agent": "Algolia for JavaScript (3.35.1); Browser",
    "x-algolia-application-id": ALGOLIA_CONFIG.appId,
    "x-algolia-api-key": ALGOLIA_CONFIG.apiKey,
    "content-type": "application/json",
  };

  const body = JSON.stringify({
    params: new URLSearchParams(params).toString(),
  });

  return fetchJson(url, { method: "POST", headers, body });
}

/**
 * Fetch all pages of events from TicketSource via Algolia API
 */
async function retrieve() {
  const movieListPages = [];
  const searchParams = buildSearchParams({ page: 0 });
  const firstResponse = await fetchAlgoliaEvents(searchParams);
  movieListPages.push(firstResponse);

  const totalPages = firstResponse.nbPages;
  let currentPage = 1; // Start from the second page
  while (currentPage + 1 <= totalPages) {
    const pageParams = buildSearchParams({ page: currentPage });
    const pageResponse = await fetchAlgoliaEvents(pageParams);
    movieListPages.push(pageResponse);
    currentPage++;
  }

  return { movieListPages };
}

module.exports = retrieve;
