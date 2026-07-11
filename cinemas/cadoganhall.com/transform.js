const cheerio = require("cheerio");
const {
  generateShowingId,
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const attributes = require("./attributes");

// Durations are written as free text, e.g. "approx. 1 hour 35 mins (no
// interval)" or "approx. 2 hours (incl. interval)". Pull out the hours and
// minutes and return the total in minutes (or undefined when not stated).
const parseDurationMins = (text) => {
  if (!text) return undefined;
  const hours = text.match(/(\d+)\s*hours?/i);
  const mins = text.match(/(\d+)\s*min/i);
  if (!hours && !mins) return undefined;
  return (
    (hours ? parseInt(hours[1], 10) : 0) * 60 +
    (mins ? parseInt(mins[1], 10) : 0)
  );
};

// The "add to calendar" widget records the start time in Europe/London local
// time as "YYYY-MM-DD HH:mm:ss". The transform pipeline runs with
// TZ=Europe/London, so parsing it as a local datetime gives the correct epoch.
const parseCalendarDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value.trim().replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

// Age guidance is written as prose, e.g. "the British Film Institute rates
// Frankenstein 'PG'". Pull out the quoted classification when present.
const parseClassification = (description) => {
  const match = description.match(/rates?\b[^'‘’]*['‘’]([^'‘’]+)['‘’]/i);
  return match ? match[1] : undefined;
};

// Extract each showing's date and booking link. Events with multiple showings
// list each one in the performances section; single-showing events only have
// the "add to calendar" block in the share area, with the booking link in the
// masthead.
const getRawPerformances = ($) => {
  const performanceItems = $("#performances-list .c-prod__perf-item");
  if (performanceItems.length) {
    return Array.from(performanceItems).map((item) => ({
      date: parseCalendarDate(getText($(item).find(".atc_date_start"))),
      url: $(item).find('[data-button="book"]').attr("href"),
    }));
  }

  return [
    {
      date: parseCalendarDate(
        getText($("#details .c-share .atc_date_start").first()),
      ),
      url: $('.c-prod__masthead [data-button="book"]').first().attr("href"),
    },
  ];
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const moviePageUrl in moviePages) {
    const $ = cheerio.load(moviePages[moviePageUrl]);

    const title = getText($(".c-prod__heading").first());
    if (!title) {
      throw new Error(
        `No title found for ${moviePageUrl} - the page structure may have changed`,
      );
    }

    const id = moviePageUrl
      .replace(`${attributes.domain}/whats-on/`, "")
      .replace(/\/$/, "");

    const subheading = getText($(".c-prod__subheading").first());
    const descriptionEl = $("#details div.c-content-style").first();
    descriptionEl.find("br").replaceWith("\n");
    const description = getText(descriptionEl)
      .replace(/\n{2,}/g, "\n")
      .trim();
    const overviewText = [subheading, description].filter(Boolean).join("\n");

    const overview = createOverview({
      duration: parseDurationMins(getText($(".c-prod__duration").first())),
      classification: parseClassification(description),
      trailer: $("#trailer-gallery iframe").attr("src"),
    });

    const performances = getRawPerformances($)
      .filter(({ date }) => date)
      .map(({ date, url }) =>
        createPerformance({
          date,
          url: url || moviePageUrl,
          accessibility: createAccessibility(title, {}, overviewText),
          format: createFormat(title, {}, overviewText),
        }),
      );

    if (performances.length === 0) {
      throw new Error(
        `No performances found for "${title}" (${moviePageUrl}) - the page structure may have changed`,
      );
    }

    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url: moviePageUrl,
      overview,
      performances,
      matchingHints: { overview: overviewText },
    });
  }

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
