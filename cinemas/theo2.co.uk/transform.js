const cheerio = require("cheerio");
const { parse } = require("date-fns");
const {
  createOverview,
  createPerformance,
  generateShowingId,
  createAccessibility,
  createFormat,
  sanitizeRichText,
} = require("../../common/utils");
const attributes = require("./attributes");

// The O2 publishes no film category, and runs both live-to-picture screenings
// and concerts *of* film music that screen nothing ("The Music of Tim Burton",
// "The World of Hans Zimmer"). Both bill a film composer and a live orchestra,
// so the test has to be about the film being shown.
const SCREENED_FILM_PHRASES = [
  /\bperformed\s+live\s+to\s+(?:the\s+)?(?:film|movie|picture|motion\s+picture)/i,
  /\blive\s+to\s+(?:the\s+)?(?:film|movie|picture|motion\s+picture)\b/i,
  /\bscore\s+to\s+the\s+film\b/i,
  /\bfilm\s+(?:is\s+)?(?:screened|shown|projected)\b/i,
  /\bscreening\s+of\s+the\s+(?:film|movie)\b/i,
  /\bfull[-\s]length\s+(?:film|feature)\b/i,
  /\b(?:entire|complete)\s+film\b/i,
  /\bfilm\s+in\s+(?:full|its\s+entirety)\b/i,
];

const MUSIC_SHOWCASE_TITLES = [
  /^the\s+music\s+of\b/i,
  /^the\s+world\s+of\b/i,
  /\bmusic\s+from\b/i,
  /\btribute\s+to\b/i,
];

// Stands in while a description is still a stub, as "Interstellar Live"'s was.
// Both halves are needed: "Luther Live" and "Critical Role Live" screen nothing
// and credit no orchestra, while the music showcases bill theirs as
// "Presented by", not "with".
const LIVE_SCORE_TITLE = /\s(?:live(?:\s+in\s+concert)?|in\s+concert)$/i;
const ORCHESTRA_BILLING = /\bwith\s+(?:the\s+)?[^,.]*\borchestra\b/i;

function isFilmScreening({ title, tagline, description }) {
  const text = [title, tagline, description].filter(Boolean).join("\n");

  if (SCREENED_FILM_PHRASES.some((phrase) => phrase.test(text))) return true;

  if (MUSIC_SHOWCASE_TITLES.some((phrase) => phrase.test(title))) return false;
  return LIVE_SCORE_TITLE.test(title) && ORCHESTRA_BILLING.test(tagline);
}

const STATUS_MARKER = /\s*\|\s*(cancelled|rescheduled|postponed)\s*$/i;

// The site splits a show's name across the title and the tagline, and for a film
// it is the tagline that says which instalment: "The Lord of The Rings" + "The
// Fellowship of The Ring In Concert" is one title. Joined as the venue displays
// them; trimming whatever is redundant for matching is `normalize-title`'s job.
function buildTitle(title, tagline) {
  return tagline ? `${title}: ${tagline}` : title;
}

// The slug is the only per-event id the site gives; `showing_<id>` is per date.
function getEventSlug(eventUrl) {
  return eventUrl.split("/").filter(Boolean).pop();
}

// Picked out by type, not position: the page also carries Organization and
// BreadcrumbList blocks. The event's own type varies - "Event", "MusicEvent",
// "TheaterEvent", "ExhibitionEvent" and "EventSeries" all appear - so this
// matches on "Event" anywhere in the name rather than as a suffix, which
// "EventSeries" does not have.
const EVENT_TYPE = /Event/;

function findEventData($) {
  let event;
  $('script[type="application/ld+json"]').each((_, element) => {
    if (event) return;
    try {
      const data = JSON.parse($(element).html());
      if (typeof data["@type"] === "string" && EVENT_TYPE.test(data["@type"])) {
        event = data;
      }
    } catch {
      // Not the block we're after.
    }
  });
  return event;
}

// Shown as "Doors: 7:00 PM" - the only clock the site gives a performance.
function getTime(showing) {
  const match = showing.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  return match ? match[0].toUpperCase() : undefined;
}

function parsePerformances($, event, eventUrl) {
  return $(".event_showings li.listItem")
    .map((_, element) => {
      const $showing = $(element);
      const day = $showing.find(".m-date__day").text().trim();
      const month = $showing.find(".m-date__month").text().trim();
      const year = $showing.find(".m-date__year").text().trim();
      const time = getTime($showing.find(".time").text());

      const bookingUrl = $showing.find("a.tickets").attr("href");

      return createPerformance({
        date: parse(
          `${day} ${month} ${year} ${time}`,
          "d MMM yyyy h:mm a",
          new Date(),
        ),
        url: bookingUrl || eventUrl,
        // The JSON-LD `location.name` is hardcoded to "The O2 arena" on every
        // page, including the indigo ones; the sidebar has the real room.
        screen: $(".sidebar_event_venue span").first().text().trim(),
        accessibility: createAccessibility(event.title, {}, event.description),
        format: createFormat(event.title, {}, event.description),
      });
    })
    .get();
}

function parseEventPage(html, eventUrl) {
  const $ = cheerio.load(html);
  const data = findEventData($);
  if (!data) {
    throw new Error(
      `No schema.org Event found on ${eventUrl} - the page structure may have changed`,
    );
  }

  // Everything downstream keys off the name - the title, the match, and whether
  // this counts as a screening at all - so an unnamed record would silently
  // drop a screening rather than produce a wrong one.
  const title = sanitizeRichText(data.name || "");
  if (!title) {
    throw new Error(`No event name found for ${eventUrl}`);
  }

  return {
    $,
    title,
    // The tagline is repeated once per layout. Both it and the description are
    // genuinely optional - the site ships stub listings months ahead of a show.
    tagline: sanitizeRichText($(".tagline").first().text().trim()),
    description: sanitizeRichText(data.description || ""),
    url: eventUrl,
  };
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [eventUrl, html] of Object.entries(moviePages)) {
    const event = parseEventPage(html, eventUrl);

    const status = event.title.match(STATUS_MARKER);
    if (status && status[1].toLowerCase() === "cancelled") continue;

    if (!isFilmScreening(event)) continue;

    const performances = parsePerformances(event.$, event, eventUrl);
    if (performances.length === 0) continue;

    movies.push({
      showingId: generateShowingId(attributes, getEventSlug(eventUrl)),
      title: buildTitle(event.title, event.tagline),
      url: eventUrl,
      // Sold as concerts, so no runtime, year or certificate is published.
      overview: createOverview({}),
      performances,
      matchingHints: {
        // The description is what names the film where the title only gestures
        // at it. No `crew` hint as `alexandrapalace.com` gives: the names here
        // are mostly the conductor and orchestra, and `extractPeopleNames`
        // splits the one real credit ("Peter Jackson's film") into two.
        overview: event.description,
      },
    });
  }

  // No assertion on `movies`: screenings are occasional bookings at an arena, so
  // a run with nothing to show is a normal outcome. `retrieve` asserts the feed
  // and `parseEventPage` asserts each page instead.

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
