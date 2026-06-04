const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { url } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".whats-on-grid");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".whats-on-grid .event .event-name a").each(function () {
    const href = $(this).attr("href");
    moviePageUrls.add(href);
  });

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    const moviePage = await fetchText(moviePageUrl);
    const $movie = cheerio.load(moviePage);

    // Extract Spektrix EventId from the iframe src
    const iframeSrc = $movie("#SpektrixIFrame").attr("src");
    // Skip pages without a Spektrix iframe (e.g. series pages like "Black Film Club")
    if (!iframeSrc) continue;

    const eventIdMatch = iframeSrc.match(/EventId=(\d+)/);
    if (!eventIdMatch) continue;

    const eventId = eventIdMatch[1];
    const spektrixUrl = `https://tickets.dugdaleartscentre.co.uk/millfieldartscentre/website/EventDetails.aspx?EventId=${eventId}`;
    const spektrixPage = await fetchText(spektrixUrl);

    if (!spektrixPage.includes("EventDates")) {
      throw new Error(`Performance dates not included in ${spektrixUrl}`);
    }

    moviePages[moviePageUrl] = {
      moviePage,
      spektrixPage,
      eventId,
    };
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
