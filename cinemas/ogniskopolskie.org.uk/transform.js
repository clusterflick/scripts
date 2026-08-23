const cheerio = require("cheerio");
const { parse } = require("date-fns");
const {
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { extractPeopleNames } = require("../../common/extract-people");
const { isFilmEvent } = require("../../common/is-film-event");
const attributes = require("./attributes");

// The club entered one screening's start as "7:00 AM". It is the only AM time
// across the whole programme - 13 of its 18 events start at 7:00 PM, its other
// KinoKlub screening included - and the product's own description reads
// "Saturday, 11th October, 2026 / 7pm for 7.30pm". So this is an AM/PM slip,
// and flipping it is choosing between two values the club itself published
// rather than inventing a third.
//
// Pinned to the product AND to the wrong value so it lapses the moment they
// correct it, rather than silently overriding a time they later fix.
const KNOWN_BAD_START_TIMES = {
  W7HJETQSPP6GYDYCUWM36AXP: { published: "7:00 AM", corrected: "7:00 PM" },
};

const getStartTime = ({ site_product_id: productId }, startTime) => {
  const known = KNOWN_BAD_START_TIMES[productId];
  if (!known || known.published !== startTime) return startTime;
  return known.corrected;
};

const getOverview = (description) =>
  cheerio
    .load(`<div>${description || ""}</div>`)("div")
    .first()
    .text()
    .trim();

async function transform({ products }, sourcedEvents) {
  const movies = [];

  for (const product of products) {
    // The store sells books, membership and pins alongside its programme;
    // only an event has a date to screen anything on
    if (product.product_type !== "event") continue;

    // The club's own title is kept as it stands - the "<day> <month> |" and
    // "Kinoklub - " prefixes are handled in `normalize-title.js`, so the
    // grouping key is clean while the site still shows what the venue called it
    const title = `${product.name}`.trim();
    if (!title) {
      throw new Error(`No title found for product ${product.id}`);
    }

    const overview = getOverview(product.short_description);
    // Mostly talks, concerts and supper clubs, so the listing has to say for
    // itself that a film is being shown
    if (!isFilmEvent(`${product.name} ${overview}`)) continue;

    const details = product.product_type_details || {};
    const { start_date: startDate, start_time: startTime } = details;
    if (!startDate || !startTime) {
      throw new Error(
        `No start date or time for product ${product.id} - the response shape may have changed`,
      );
    }

    const date = parse(
      `${startDate} ${getStartTime(product, startTime)}`,
      "yyyy-MM-dd h:mm a",
      new Date(),
    );
    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `Unreadable start "${startDate} ${startTime}" for product ${product.id}`,
      );
    }

    const url = product.absolute_site_link;
    if (!url) {
      throw new Error(
        `No link for product ${product.id} - the response shape may have changed`,
      );
    }

    movies.push({
      showingId: generateShowingId(attributes, product.site_product_id),
      title,
      url: encodeURI(url),
      overview: createOverview({}),
      performances: [
        createPerformance({
          date,
          url,
          accessibility: createAccessibility(title, {}, overview),
          format: createFormat(title, {}, overview),
        }),
      ],
      matchingHints: {
        overview,
        crew: extractPeopleNames(overview),
      },
    });
  }

  // No assertion on `movies` here: most of what the club programmes isn't
  // film, so a run with nothing to show is a normal outcome. `retrieve`
  // asserts the store response instead.

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
