const cheerio = require("cheerio");

const collapse = (value) => value.replace(/\s+/g, " ").trim();

const getJsonLd = ($, type) =>
  $('script[type="application/ld+json"]')
    .toArray()
    .map((script) => JSON.parse($(script).html()))
    .find((data) => data["@type"] === type);

// The store page's "Upcoming Events" cards. Each links to the event's own page,
// which is where the times are.
const getEventPaths = (storePage) => {
  const $ = cheerio.load(storePage);
  return [
    ...new Set(
      $("article.preview-card.-event a[href*='/event/']")
        .map((_, a) => $(a).attr("href"))
        .get(),
    ),
  ];
};

// An event page carries a schema.org Event for its name, description and times,
// and names its store in the location drawer. Norrøna's events run across
// every store it has, so the store is checked rather than assumed.
const parseEventPage = (html) => {
  const $ = cheerio.load(html);
  const event = getJsonLd($, "Event");
  if (!event) throw new Error("No Event JSON-LD on the event page");
  const store = collapse($(".event-location-byline-name").first().text());
  if (!store) throw new Error(`No event location for "${event.name}"`);
  return {
    title: collapse(event.name),
    description: collapse(event.description || ""),
    // A local time with no offset, which is London's for this store
    startDate: event.startDate,
    eventStatus: event.eventStatus,
    store,
    text: collapse($(".content-area-portable-text").text()),
  };
};

// The store hosts launches, talks and parties as well as screenings, and labels
// none of them. Anything that mentions a film is kept for the categoriser.
const isFilmEvent = ({ title, description, text }) =>
  /\b(films?|screenings?|movies?)\b/i.test(`${title} ${description} ${text}`);

module.exports = { getJsonLd, getEventPaths, parseEventPage, isFilmEvent };
