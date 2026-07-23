const cheerio = require("cheerio");
const {
  getText,
  sanitizeRichText,
  createOverview,
  createPerformance,
  generateShowingId,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

// Vue component attributes hold HTML-escaped JSON, e.g.
// :event-data="{&quot;eventId&quot;:41475,...}".
function parseComponentData(value) {
  return JSON.parse(value.replace(/&quot;/g, '"'));
}

// The ld+json Event blocks HTML-escape their string values, so the quotes
// delimiting them arrive as &quot;. They also contain raw control characters
// (unescaped newlines in descriptions) and trailing commas left by empty
// fields, so they can't be parsed as-is. Sanitize before parsing.
//
// The page's other ld+json blocks (Organization, LocalBusiness) are malformed
// and unparseable, so select the Event blocks (one per showtime) by their raw
// text rather than parsing everything and filtering on @type — that way a
// broken Event block throws instead of being silently skipped.
function getScreeningEvents($) {
  return $('script[type="application/ld+json"]')
    .filter(function () {
      return /"@type"\s*:\s*"Event"/.test($(this).html());
    })
    .map(function () {
      const sanitized = $(this)
        .html()
        .replace(/&quot;/g, '"')
        .replace(/[\n\r\t]/g, " ")
        .replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(sanitized);
    })
    .get();
}

function getDetails($) {
  const details = {};
  $(".c-meta__item").each(function () {
    const key = getText($(this).find(".c-meta__key")).toLowerCase();
    const value = getText($(this).find(".c-meta__value"));
    if (key) details[key] = value;
  });
  return details;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = Object.entries(moviePages).reduce(
    (moviesWithPerformances, [url, html]) => {
      const $ = cheerio.load(html);

      // One ld+json Event per showtime (start dates), and one
      // event-manager[type=instance] per showtime (booking links), both in the
      // same chronological order.
      const events = getScreeningEvents($);
      if (events.length === 0) return moviesWithPerformances;

      const bookingUrls = $("event-manager[type=instance]")
        .map(function () {
          return parseComponentData($(this).attr(":button-data"))
            .buttonDefaultUrl;
        })
        .get();

      if (events.length !== bookingUrls.length) {
        throw new Error(
          `Found ${events.length} showtimes but ${bookingUrls.length} booking links for ${url} - the page structure may have changed`,
        );
      }

      const eventData = parseComponentData(
        $("event-manager").first().attr(":event-data"),
      );
      const title = sanitizeRichText(eventData.eventName);
      // Descriptions are double-encoded (e.g. "&amp;amp;"), so decode twice.
      const overview = sanitizeRichText(
        sanitizeRichText(events[0].description || ""),
      );
      const details = getDetails($);

      return moviesWithPerformances.concat({
        showingId: generateShowingId(attributes, eventData.eventId),
        title,
        url,
        overview: createOverview({
          duration: details.duration,
          classification: details.certificate,
          directors: details.director || "",
        }),
        performances: events.map((event, index) =>
          createPerformance({
            date: parseDate(event.startDate),
            url: bookingUrls[index],
            accessibility: createAccessibility(title, {}, overview),
            format: createFormat(title, {}, overview),
          }),
        ),
        matchingHints: { overview },
      });
    },
    [],
  );

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
