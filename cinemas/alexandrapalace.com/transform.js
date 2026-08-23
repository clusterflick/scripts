const cheerio = require("cheerio");
const { decode } = require("html-entities");
const { parse } = require("date-fns");
const {
  getText,
  basicNormalize,
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { extractPeopleNames } = require("../../common/extract-people");
const { isFilmEvent } = require("../../common/is-film-event");
const attributes = require("./attributes");

// Every listing carries a schema.org Event, which is where the title comes
// from - the page's first <h1> belongs to the site search overlay, not to the
// event.
const getEventSchema = ($, moviePageUrl) => {
  const schemas = $('script[type="application/ld+json"]')
    .map((i, el) => {
      try {
        return JSON.parse($(el).text());
      } catch {
        return undefined;
      }
    })
    .get();

  const event = schemas.find(({ "@type": type }) => type === "Event");
  if (!event) {
    throw new Error(
      `No schema.org Event found on ${moviePageUrl} - the page structure may have changed`,
    );
  }
  return event;
};

// The listing's WordPress post id is stable across re-titles and re-runs,
// which the slug is not.
const getEventId = ($, moviePageUrl) => {
  const apiHref = $('link[rel="alternate"][type="application/json"]').attr(
    "href",
  );
  const match = `${apiHref}`.match(/\/wp\/v2\/event\/(\d+)/);
  if (!match) {
    throw new Error(
      `No WordPress event id found on ${moviePageUrl} - the page structure may have changed`,
    );
  }
  return match[1];
};

// The timetable gains a badge column only when a run has something to badge -
// a preview, a captioned night - so the start time is not at a fixed offset.
// Read the position out of the header rather than counting cells, and throw
// if it isn't there: a silently wrong column would publish door times as
// screening times.
const getStartTimeIndex = ($, $table, moviePageUrl) => {
  const headers = $table
    .find("thead th")
    .map((i, el) => basicNormalize(getText($(el))))
    .get();

  const index = headers.findIndex((header) => header.includes("start"));
  if (index === -1) {
    throw new Error(
      `No start time column in the timetable on ${moviePageUrl} - the page structure may have changed`,
    );
  }

  // The date is a row header rather than a cell, so the cells run one behind
  return index - 1;
};

// Alexandra Palace marks accessible performances individually in the
// timetable, so they're read per row rather than inferred from the event.
// Anything not in this mapping - a preview, a press night - is not an
// accessibility marker and is deliberately left off.
const BADGE_ACCESSIBILITY = {
  "audio-described": "audioDescription",
  captioned: "hardOfHearing",
};

const getRowAccessibility = ($, $row) =>
  $row
    .find(".event-info-badge")
    .map((i, el) => $(el).attr("class"))
    .get()
    .flatMap((className) => `${className}`.split(/\s+/))
    .reduce((accessibility, token) => {
      const key = BADGE_ACCESSIBILITY[token];
      return key ? { ...accessibility, [key]: true } : accessibility;
    }, {});

// Not every listing publishes a timetable - a one-off gig often carries only
// its schema.org Event. That Event's startDate is the performance's start
// time rather than its doors time (on the listings that have both, it matches
// the timetable's "Start time" column, not "Doors open"), so it stands in as a
// single performance. A listing with neither is genuinely undated and is left
// alone rather than given a time we'd have had to invent.
const getSchemaPerformance = (event, moviePageUrl, title, overview) => {
  if (!event.startDate) return [];

  const date = parse(`${event.startDate}`, "yyyy-MM-dd HH:mm:ss", new Date());
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Unreadable startDate "${event.startDate}" on ${moviePageUrl}`,
    );
  }

  return [
    createPerformance({
      date,
      url: moviePageUrl,
      accessibility: createAccessibility(title, {}, overview),
      format: createFormat(title, {}, overview),
    }),
  ];
};

const getPerformances = ($, event, moviePageUrl, title, overview) => {
  const $table = $("table.event_timetable").first();
  if ($table.length === 0) {
    return getSchemaPerformance(event, moviePageUrl, title, overview);
  }

  const startTimeIndex = getStartTimeIndex($, $table, moviePageUrl);

  return $table
    .find("tbody tr")
    .map((i, el) => {
      const $row = $(el);
      const day = getText($row.find('th[scope="row"]'));
      const startTime = getText($row.find("td").eq(startTimeIndex));
      if (!day || !startTime) return undefined;

      const date = parse(`${day} ${startTime}`, "d MMM yyyy HH:mm", new Date());
      if (Number.isNaN(date.getTime())) {
        throw new Error(
          `Unreadable performance "${day} ${startTime}" on ${moviePageUrl}`,
        );
      }

      return createPerformance({
        date,
        url: moviePageUrl,
        accessibility: createAccessibility(
          title,
          getRowAccessibility($, $row),
          overview,
        ),
        format: createFormat(title, {}, overview),
      });
    })
    .get()
    .filter(Boolean);
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [moviePageUrl, moviePage] of Object.entries(moviePages)) {
    const $ = cheerio.load(moviePage);

    const event = getEventSchema($, moviePageUrl);
    // The theme HTML-escapes the values it writes into the ld+json, so an
    // ampersand in a title arrives as "&amp;"
    const title = decode(`${event.name}`).trim();
    if (!title) {
      throw new Error(`No title found for ${moviePageUrl}`);
    }

    // Alexandra Palace is a concert, comedy and sport venue: its "Film" tag
    // exists but nothing carries it, not even the films, so a listing has to
    // say for itself that one is being shown. Every listing has a description
    // to say it in, and one without would silently match nothing.
    const $description = $(".ap_text_block").first();
    if ($description.length === 0) {
      throw new Error(
        `No description found on ${moviePageUrl} - the page structure may have changed`,
      );
    }

    const overview = getText($description);
    if (!isFilmEvent(`${title} ${overview}`)) continue;

    const performances = getPerformances(
      $,
      event,
      moviePageUrl,
      title,
      overview,
    );

    if (performances.length === 0) {
      // A listing can go up before its dates are announced. Skip it for now -
      // the assertion below still catches a change to the page structure.
      continue;
    }

    movies.push({
      showingId: generateShowingId(attributes, getEventId($, moviePageUrl)),
      title,
      url: encodeURI(moviePageUrl),
      overview: createOverview({}),
      performances,
      matchingHints: {
        overview,
        crew: extractPeopleNames(overview),
      },
    });
  }

  // No assertion on `movies` here: most of what this venue lists isn't film,
  // so a run with nothing to show is a normal outcome rather than a broken
  // one. `retrieve` asserts the listing structure instead.

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
