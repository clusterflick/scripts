const cheerio = require("cheerio");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const { url } = require("./attributes");
const { LISTING_LINK } = require("./utils");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// This venue is ticketed by Spektrix, and JW3's probe next door counts real
// performances out of Spektrix's client-wide events and instances calls. That
// does not work here. The Spektrix client is the council's - Forty Hall, Active
// Enfield and the Museum of Enfield share it, 1104 events against JW3's 267 -
// and the events call ignores `startFrom`, so the two calls that cost JW3 360KB
// cost this venue 2.5MB, every hour, to count five listings. That is worse than
// the retrieve it would be saving.
//
// So this reads the venue's own film listing and stops: one request, and no
// dates, because the cards carry a title, a type and a duration and nothing
// else. It catches the listing breaking, the film filter changing under us and
// the programme emptying; it cannot see a publish that adds dates to films
// already listed.
const GRANULARITY = "film-totals";

// Listings rather than films: the grid carries series pages - "Talkies Community
// Cinema", "Black Film Club" - alongside the films themselves, and the retrieve
// only finds out which is which by opening each page and looking for a Spektrix
// booking iframe. That is five more requests to sharpen a number this probe is
// not reporting as films in the first place.
const COUNT_NAME = "listings";

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;

  let listings;
  try {
    const html = await withChallengeRetry(() => probeText(url), venue.id);
    countRequest();

    const $ = cheerio.load(html);
    if ($(".whats-on-grid").length === 0) {
      throw probeError(
        "No `.whats-on-grid` on the what's-on page - the listing may have changed shape",
      );
    }
    listings = new Set(
      $(LISTING_LINK)
        .map(function () {
          return $(this).attr("href");
        })
        .get(),
    ).size;
  } catch (error) {
    countRequest();
    return finalise([{ venue: venue.id, reason: reasonFor(error) }]);
  }

  // The grid is there and empty, which is a venue with nothing on rather than a
  // listing that has broken - the selector check above is what tells them apart.
  if (listings === 0) {
    return finalise([
      { venue: venue.id, reason: { kind: "no-listings-found" } },
    ]);
  }

  return finalise([{ venue: venue.id, counts: { [COUNT_NAME]: listings } }]);
}

module.exports = health;
