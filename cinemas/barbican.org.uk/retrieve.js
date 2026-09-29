const cheerio = require("cheerio");
const { fetchJson, fetchText, getText } = require("../../common/utils");
const { getParams, isArchivedListing } = require("./utils");
const { domain } = require("./attributes");

// Safety cap on pagination - the cinema calendar runs to around five pages, so
// this should never be reached. Throw if it is rather than paging on until the
// site challenges the crawl, which is what a page parameter the site has
// stopped honouring looks like.
const MAX_PAGES = 25;

async function retrieve() {
  const movieIds = new Set();
  const movieTitles = new Map();

  let page = 0;
  while (page < MAX_PAGES) {
    const responseData = await fetchJson(
      `${domain}/views/ajax?${getParams(page)}`,
    );
    const { data } = responseData.find(
      ({ method }) =>
        method === "infiniteScrollInsertView" || method === "replaceWith",
    );

    const $ = cheerio.load(data);

    if ($(".no-result-message").length > 0) {
      // A first page with no results is not a cinema with nothing on - it is
      // the site answering with something other than its listing, and passing
      // it on as an empty retrieve only defers the failure to transform, past
      // the retry that could clear it.
      if (page === 0) {
        throw new Error("No results on the first page of the cinema listing");
      }
      break;
    }

    $(".listing--event").each(function () {
      const $listing = $(this);
      const title = getText($listing.find(".listing-title--event"));
      const movieId = $listing
        .find("button.saved-event-button")
        .data("saved-event-id");

      if (movieId === undefined) {
        if (isArchivedListing($listing)) return;
        throw new Error(`Missing event id in listing: "${title}"`);
      }

      movieIds.add(movieId);
      movieTitles.set(movieId, title);
    });

    page++;
  }

  if (page === MAX_PAGES) {
    throw new Error(
      "Exceeded maximum page limit — stopping condition may have changed",
    );
  }

  const moviePages = [];
  for (const movieId of movieIds) {
    try {
      const [performancePage, listingPage] = await Promise.all([
        fetchText(`${domain}/whats-on/event/${movieId}/performances`),
        fetchText(`${domain}/node/${movieId}`),
      ]);

      moviePages.push({
        movieId,
        title: movieTitles.get(movieId),
        performancePage,
        listingPage,
      });
    } catch (e) {
      if (e.message.includes("500 Internal Server Error")) {
        console.log(
          `Skipping retrieving movie details due to Internal Server Error: ${domain}/node/${movieId}`,
        );
        continue;
      }
      throw e;
    }
  }

  return { moviePages };
}

module.exports = retrieve;
