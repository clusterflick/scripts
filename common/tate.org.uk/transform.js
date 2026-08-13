const cheerio = require("cheerio");
const { parse, addDays, isAfter } = require("date-fns");
const {
  getText,
  createPerformance,
  createFormat,
  createOverview,
  generateShowingId,
  createAccessibility,
} = require("../utils");

// "7 August 2026 at 19.00–21.00" — a single screening, end time ignored.
const singleDatePattern =
  /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+at\s+(\d{1,2})\.(\d{2})/;
// "17 - 23 August 2026 11.00 - 14.00" — a run of daily screenings at the same
// time. The start month is only given when the run crosses a month boundary.
const dateRangePattern =
  /^(\d{1,2})(?:\s+([A-Za-z]+))?\s*[–-]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2})\.(\d{2})/;

function buildDate(day, month, year, hours, minutes) {
  const date = parse(
    `${day} ${month} ${year} ${hours}:${minutes}`,
    "d MMMM yyyy H:mm",
    new Date(),
  );
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `tate.org.uk: could not parse date "${day} ${month} ${year} ${hours}.${minutes}"`,
    );
  }
  return date;
}

function parseDateTime(dateTimeString) {
  const range = dateTimeString.match(dateRangePattern);
  if (range) {
    const [, startDay, startMonth, endDay, endMonth, year, hours, minutes] =
      range;
    const start = buildDate(
      startDay,
      startMonth || endMonth,
      year,
      hours,
      minutes,
    );
    const end = buildDate(endDay, endMonth, year, hours, minutes);
    if (isAfter(start, end)) {
      throw new Error(
        `tate.org.uk: date range ends before it starts "${dateTimeString}"`,
      );
    }

    const dates = [];
    for (let date = start; !isAfter(date, end); date = addDays(date, 1)) {
      dates.push(date);
    }
    return dates;
  }

  const single = dateTimeString.match(singleDatePattern);
  if (single) {
    const [, day, month, year, hours, minutes] = single;
    return [buildDate(day, month, year, hours, minutes)];
  }

  throw new Error(`tate.org.uk: unrecognised date format "${dateTimeString}"`);
}

// Events running on several dates list them all in one element, separated by
// <br>. Read the children so each date stays its own string rather than being
// flattened into "…21.007 August…" by a plain text extraction.
function getDateTimeStrings($, $filmEvent) {
  const lines = [];
  let current = "";

  $filmEvent
    .find(".splash-header__dates")
    .contents()
    .each(function () {
      if (this.tagName === "br") {
        lines.push(current);
        current = "";
        return;
      }
      current += $(this).text();
    });
  lines.push(current);

  return lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// Multi-film events keep their running order — each film's title, director,
// year, country and length — in a "Programme" accordion below the description,
// which only says something like "seven short African films". That list is
// exactly what the shorts and multiple-movies prompts are being asked to work
// out, so it goes into the matching hints. Take that panel alone rather than
// the whole body: the accordions beside it are generic venue boilerplate that
// would pad every prompt with the same few hundred words about step-free
// entrances and where to borrow ear defenders.
function getProgramme($, $filmEvent) {
  const $programme = $filmEvent
    .find(".accordion__item")
    .filter(function () {
      return (
        getText($(this).find(".accordion__title").first()).toLowerCase() ===
        "programme"
      );
    })
    .first();

  return getText($programme.find(".accordion__content").first());
}

// Tate marks a sold-out event in the page banner rather than against each date,
// so the flag necessarily covers every performance the event runs — the badge
// is only applied once the whole event has gone. The listing page carries a
// `tag-status_sold-out` class on the card, but `transform` only ever sees the
// event pages, and the banner says the same thing.
//
// The banner is reused for other notices, so match on the wording rather than
// treating its presence as sold out.
function getStatus($filmEvent) {
  const alert = getText(
    $filmEvent.find(".banner__status-alert-headline").first(),
  );

  return /sold out/i.test(alert) ? { soldOut: true } : {};
}

function getEventIdFromUrl(url) {
  // Extract a unique ID from the URL path
  const path = new URL(url).pathname;
  return path.split("/").filter(Boolean).pop() || path;
}

// Tate is deliberately left without a duration.
//
// Neither figure on the page is the running time. The prose mentions minutes
// for other things entirely — "the films are all less than around 5 minutes
// long" is the length of one short in a programme, and "2hrs and 33 min" for a
// seminar both describes a segment and loses its hours to a minutes-only match.
// The time range in the header ("19.00–21.00") is the room booking, which pads
// out the feature with introductions and discussion, and for a members'
// screening slot can even be shorter than the film itself.
//
// Leaving it unset is better than either: `find-matches-on-the-movie-db` fills
// duration in from the TMDB runtime whenever the venue hasn't supplied one, so
// a wrong value here would displace an accurate one and skew the shorts and
// multiple-movies prompts, which are given the duration as a signal.

async function transform(attributes, { moviePages }, sourcedEvents) {
  const shows = [];

  for (const [url, html] of Object.entries(moviePages)) {
    const $ = cheerio.load(html);
    const $filmEvent = $("article.event");
    const title = getText($filmEvent.find("h1")).replace(/\s+/g, " ").trim();
    const eventId = getEventIdFromUrl(url);
    const status = getStatus($filmEvent);
    // Tate drops the ticket link once an event sells out, so this falls back to
    // the event page — which is the page saying it has sold out.
    const bookingUrl =
      $filmEvent.find('a[href*="ticket"]').first().attr("href") || url;

    const description = $filmEvent
      .find(".container__inner > .block-rich_text > *")
      .toArray()
      .map((el) => getText($(el)))
      .join("\n\n");
    const overview = `${getText($filmEvent.find(".content__standfirst"))}\n\n${description}`;

    // The programme is a matching hint only — it lists the films rather than
    // describing this screening, so it must not reach the accessibility and
    // format detection below, which read the event's own copy.
    const programme = getProgramme($, $filmEvent);
    const matchingOverview = programme
      ? `${overview}\n\n${programme}`
      : overview;

    const dates = getDateTimeStrings($, $filmEvent).flatMap(parseDateTime);

    shows.push({
      showingId: generateShowingId(attributes, eventId),
      title,
      url,
      overview: createOverview({}),
      performances: dates.map((date) =>
        createPerformance({
          date,
          url: bookingUrl,
          status,
          accessibility: createAccessibility(title, {}, overview),
          format: createFormat(title, {}, description),
        }),
      ),
      matchingHints: { overview: matchingOverview },
    });
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return shows.concat(listOfSourcedEvents);
}

module.exports = transform;
