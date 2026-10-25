const cheerio = require("cheerio");
const { decode } = require("html-entities");
const { startOfMinute } = require("date-fns");
const {
  getText,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { extractPeopleNames } = require("../../common/extract-people");
const { isFilmEvent } = require("../../common/is-film-event");
const attributes = require("./attributes");

// The club's own address, as each of its events gives it. It lists the odd
// night it runs elsewhere - at Christie's, at Interval - under the same feed.
const CLUB_ADDRESS = "6 Redchurch Street";

const getDescription = (html) => {
  const $ = cheerio.load(html || "");
  $("br").replaceWith("\n");
  $("p, h1, h2, h3, h4, h5, h6, li").after("\n");
  return getText($.root());
};

async function transform({ events }, sourcedEvents) {
  const movies = [];

  for (const event of events) {
    const moviePageUrl = `${attributes.domain}${event.fullUrl}`;

    if (!event.location) {
      throw new Error(
        `No location on ${moviePageUrl} - the feed's structure may have changed`,
      );
    }
    if (event.location.addressLine1 !== CLUB_ADDRESS) continue;

    // Titles carry Squarespace's entities - "Session 04 –&nbsp;Invisible
    // Bonds" - and the odd trailing space
    const title = decode(`${event.title}`).replace(/\s+/g, " ").trim();
    if (!title) {
      throw new Error(`No title found for ${moviePageUrl}`);
    }

    // A members' club with a room it calls its cinema, which hosts talks and
    // tastings as well as screenings - so a listing has to say for itself
    // that a film is being shown.
    const overview = getDescription(event.body);
    if (!isFilmEvent(`${title} ${overview}`)) continue;

    movies.push({
      showingId: generateShowingId(attributes, event.id),
      title,
      url: moviePageUrl,
      overview: createOverview({}),
      performances: [
        createPerformance({
          // Epoch milliseconds with a stray remainder - "...600671"
          date: startOfMinute(new Date(event.startDate)),
          url: moviePageUrl,
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

  // No assertion on `movies` here: most of what the club runs isn't film, so a
  // run with nothing to show is a normal outcome. `retrieve` asserts the
  // feed's structure instead.

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (sourced) => sourced,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
