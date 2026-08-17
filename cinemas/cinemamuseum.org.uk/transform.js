const cheerio = require("cheerio");
const { parse, isValid } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  getText,
  createPerformance,
  createOverview,
  getMovieTitleAndYearFrom,
  generateShowingId,
  basicNormalize,
  createAccessibility,
  createFormat,
  removeAlreadyListedPerformances,
} = require("../../common/utils");
const attributes = require("./attributes");

function parseDate(dateString) {
  const longform = parse(dateString, "MMMM d, yyyy @ HH:mm", new Date(), {
    locale: enGB,
  });
  if (isValid(longform)) return longform;
  const shortform = parse(dateString, "d MMMM @ HH:mm", new Date(), {
    locale: enGB,
  });
  return shortform;
}

function getDate($) {
  const dateString = getText($(".tribe-event-date-start"));
  const parsedDate = parseDate(dateString);

  if (!isNaN(parsedDate.getTime())) return parsedDate;

  // If the date can't be parsed, it may be because they forgot to put the time.
  // Check the description to see if there's a time mentioned.
  const description = getText($(".entry"));
  const timeMatch = description.match(
    /doors open at [^\s]+ for a ([^\s]+) start/i,
  );
  if (!timeMatch) return;

  const constructedDate = parseDate(
    `${dateString} @ ${timeMatch[1].replace(".", ":")}`,
  );
  if (!isNaN(constructedDate.getTime())) return constructedDate;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = {};

  Object.keys(moviePages).forEach((url) => {
    const moviePage = moviePages[url];
    const $ = cheerio.load(moviePage);

    const $title = $("#tribe-events-content h1");
    const suffix = getText($title.find("span"));
    const soldOut = basicNormalize(suffix).includes("sold out");
    const status = !soldOut ? undefined : { soldOut };
    $title.find("span").remove();
    const title = getText($title);
    if (basicNormalize(title).includes("screening cancelled")) return;
    const postId = $(".tribe_events.type-tribe_events")
      .attr("id")
      .replace("post-", "");
    const showingId = generateShowingId(attributes, postId);

    if (!movies[showingId]) {
      let directors;
      const description = getText($(".tribe_events .tribe-events-content"));
      const directedByMatch = description.match(
        /directed\s+by\s+(.*?)(?:\n|,|;|(?<=\w{2})\.|\sand\s|\swith\s|\sstarring\s)/i,
      );
      if (directedByMatch) {
        directors = directedByMatch[1].replace(/\.$/, "");
      }
      const { year } = getMovieTitleAndYearFrom(title);
      const overview = createOverview({ year, directors });
      movies[showingId] = {
        showingId,
        title,
        url,
        overview,
        performances: [],
        matchingHints: { overview: description },
      };
    }

    const date = getDate($);
    if (!date) {
      // Skip entries without a date. The Cinema Museum has been putting up
      // festival and placeholder pages without complete date+time data.
      return;
    }

    const bookingUrl = $(".tribe-rc-get-tickets-primary-link").attr("href");
    movies[showingId].performances = movies[showingId].performances.concat(
      createPerformance({
        date,
        url: bookingUrl || url,
        status,
        accessibility: createAccessibility(
          movies[showingId].title,
          {},
          movies[showingId].matchingHints?.overview,
        ),
        format: createFormat(
          movies[showingId].title,
          {},
          movies[showingId].matchingHints?.overview,
        ),
      }),
    );
  });

  if (Object.keys(movies).length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listedMovies = Object.values(movies);
  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );

  // The museum sells every night through Eventbrite or Outsavvy and links
  // straight out to them, so the sources covering those platforms find the same
  // screenings the site already lists - each side spelling the link its own way
  // ("/e/<slug>-tickets-<id>" against "/checkout-external?eid=<id>").
  return listedMovies.concat(
    removeAlreadyListedPerformances(listedMovies, listOfSourcedEvents, {
      venueDomain: attributes.domain,
    }),
  );
}

module.exports = transform;
