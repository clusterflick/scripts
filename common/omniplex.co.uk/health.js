const cheerio = require("cheerio");
const {
  probeText,
  probeError,
  ProbeFailure,
  startObservation,
  withChallengeRetry,
} = require("../health-probe");
const { extractAllowedDates } = require("./utils");

// Two requests a venue, against a retrieve's fifty-five.
//
// Omniplex publishes one date at a time: `/cinema/showtimes/<site>` renders a
// single date and `?filterDate=` fetches another, so the film x date matrix the
// other chains hand over in one call costs a request per published date here -
// 54 at Sutton the day this was written, which is exactly what the retrieve
// pays and far too much to repeat hourly.
//
// So the probe counts the two axes instead of their product, and says so rather
// than implying a matrix it never read. The showtimes page names every date the
// venue has listings for in `allowedDatesTimestamps`, and `/cinema/movies/<site>`
// is every film on sale there; a publish shows as either total growing. There is
// no honest `byDate` to report without paying the retrieve's price, so there
// isn't one.
const GRANULARITY = "film-and-date-totals";

// Films are marked by their favourites toggle - `favourite<id>` - which is the
// same id the transform builds a showing id from.
const FAVOURITE_ID = /^favourite(.+)$/;

// An unrecognised site slug does not 404: the page comes back 200 as the chain's
// own site chooser - "Which is your local Omniplex?" - which is Omniplex
// answering with its site list. That is the check that tells a venue with
// nothing on from an id that has gone stale, so the probe looks for the chooser
// before it looks for listings.
//
// It is the chooser's *form* that says so, not its items: every page on the site
// carries the same 44 `.site-selection-item` entries in a hidden overlay, and
// only the page that is actually asking wraps them in `#siteList`.
const isSiteChooser = ($) => $("#siteList").length > 0;

const unknownVenueId = (cinemaId) =>
  new ProbeFailure({ kind: "unknown-venue-id", cinemaId });

const getPublishedDates = async (domain, cinemaId) => {
  const html = await probeText(`${domain}/cinema/showtimes/${cinemaId}`);
  if (isSiteChooser(cheerio.load(html))) throw unknownVenueId(cinemaId);

  try {
    return extractAllowedDates(html);
  } catch (error) {
    // The site chooser is the only shape that means the id is wrong; a
    // showtimes page without its date list is the page having changed.
    throw probeError(error.message);
  }
};

const getFilms = async (domain, cinemaId) => {
  const $ = cheerio.load(
    await probeText(`${domain}/cinema/movies/${cinemaId}`),
  );
  if (isSiteChooser($)) throw unknownVenueId(cinemaId);

  const films = new Set(
    $('img[id^="favourite"]')
      .map((index, element) => $(element).attr("id").match(FAVOURITE_ID)?.[1])
      .get()
      .filter(Boolean),
  );
  if (films.size === 0) {
    throw probeError("No favourite-marked films on the movies page");
  }
  return films;
};

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);

  const untracked = venues.filter(({ cinemaId }) => !cinemaId);
  if (untracked.length > 0) {
    // Not a probe result - the listing is addressed by site slug, and inventing
    // one would put a made-up id into the request.
    throw new Error(
      `No cinemaId on ${untracked.map(({ id }) => id).join(", ")}; the listing is addressed by it`,
    );
  }

  const results = [];
  for (const { id, domain, cinemaId } of venues) {
    try {
      // Retried as one unit so both pages come from the same fresh attempt.
      const { dates, films } = await withChallengeRetry(async () => {
        const dates = await getPublishedDates(domain, cinemaId);
        countRequest();
        // A venue with nothing on has no dates and no films on sale; asking for
        // the film list anyway would spend a request to be told so twice.
        if (dates.length === 0) return { dates, films: new Set() };

        const films = await getFilms(domain, cinemaId);
        countRequest();
        return { dates, films };
      }, id);

      if (dates.length === 0) {
        results.push({ venue: id, reason: { kind: "no-listings-found" } });
        continue;
      }

      results.push({
        venue: id,
        counts: { films: films.size, dates: dates.length },
      });
    } catch (error) {
      // Each venue has its own pages, so a failure stays with that venue.
      countRequest();
      results.push({ venue: id, reason: reasonFor(error) });
    }
  }

  return finalise(results);
}

module.exports = health;
