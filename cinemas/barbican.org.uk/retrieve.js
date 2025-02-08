const cheerio = require("cheerio");
const { fetchJson, fetchText, getText } = require("../../common/utils");
const { getParams } = require("./utils");
const { domain } = require("./attributes");

async function retrieve() {
  const movieIds = new Set();
  const movieTitles = new Map();

  let page = 1;
  while (true) {
    const responseData = await fetchJson(
      `${domain}/views/ajax?${getParams(page)}`,
    );
    const { data } = responseData.find(
      ({ method }) => method === "infiniteScrollInsertView",
    );

    const $ = cheerio.load(data);

    if ($(".no-result-message").length > 0) break;

    $(".listing--event").each(function () {
      const movieId = $(this)
        .find("button.saved-event-button")
        .data("saved-event-id");

      movieIds.add(movieId);
      movieTitles.set(movieId, getText($(this).find(".listing-title--event")));
    });

    page++;
  }

  const moviePages = [];
  for (const movieId of movieIds) {
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
  }

  return { moviePages };
}

module.exports = retrieve;
