const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const {
  getEventBookingUrl,
  retrieveEventBooking,
} = require("../../common/spektrix");
const { url } = require("./attributes");
const { LISTING_LINK } = require("./utils");

// The venue's Spektrix-hosted ticketing site (tickets.dugdaleartscentre.co.uk)
// sits behind a Cloudflare rule which blocks non-browser clients outright, so
// event details and performance dates come from the Spektrix booking API
// instead — it takes the same numeric EventId used by the ticketing site.
const spektrixClient = "millfieldartscentre";

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".whats-on-grid");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(LISTING_LINK).each(function () {
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
    const booking = await retrieveEventBooking(spektrixClient, eventId);

    if (!booking.instances) {
      throw new Error(
        `Performance dates not included in ${getEventBookingUrl(spektrixClient, eventId)}`,
      );
    }

    moviePages[moviePageUrl] = {
      moviePage,
      booking,
      eventId,
    };
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
