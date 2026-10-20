const cheerio = require("cheerio");
const {
  createOverview,
  getText,
  createPerformance,
  createAccessibility,
  createFormat,
  basicNormalize,
  generateShowingId,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

const getDetails = ($, $movieData) => {
  const $details = $movieData.find("li");
  const details = {};
  $details.each(function () {
    const $prefix = $(this).find("strong");
    const key = getText($prefix)
      .replace(/[:.()]/g, "")
      .toLowerCase();
    $prefix.remove();
    const value = getText($(this));

    if (key === "country, year") {
      const [country, year] = value.split("|");
      details.country = country.trim();
      if (year?.trim().match(/^\d{4}$/)) {
        details.year = year.trim();
      }
    } else {
      details[key] = value;
    }
  });
  return details;
};

// "Bookings opening soon" is the venue's own placeholder for a screening not yet
// on sale. It goes stale the moment booking opens, and whether a ticket can be
// bought yet isn't something we report for any other venue, so it is dropped
// rather than shown as a note.
const getMoreInformation = (details) =>
  details["more information"]?.replace(/bookings? opening soon/gi, "").trim() ||
  undefined;

// The film's own seasons and festivals are the tags under its title that link
// to a "festivals-and-series" page - "London Korean Film Festival", "Film
// Africa 2026", "French Film Festival London". The other tags ("Films", "New
// Releases") are the venue's own shelves and link nowhere. Nothing in the markup
// tells a festival from one of the venue's seasons, so all of them become notes,
// as the ICA's do; the related-films cards further down the page link to
// seasons too, which is why only the title block is read.
const getSeries = ($) =>
  $(".film-introduction .title-dates .tags .tags__tag a")
    .filter((_index, element) => {
      const href = $(element).attr("href");
      if (!href) return false;
      return new URL(href, attributes.url).pathname.startsWith(
        "/festivals-and-series/",
      );
    })
    .map((_index, element) => getText($(element)))
    .get()
    .filter(Boolean)
    .map((name) => `Part of ${name}`);

const getOverview = (details) => {
  const duration = details.duration
    ? details.duration.replace("mins", "").trim()
    : undefined;
  return createOverview({
    year: details.year,
    duration,
    directors: details.directors,
    actors: details.cast,
    classification: details.cert,
  });
};

const getMultiplePerformances = (
  $,
  $multiple,
  details,
  moviePageUrl,
  title,
  overview,
  series,
) => {
  return $multiple
    .find("tbody tr")
    .map((i, el) => {
      const $single = $(el);
      const day = $single.find("time.date").attr("datetime");
      const time = $single.find("time.time").attr("datetime");
      const calendarNote = getText($single.find(".calendar-note"));
      const performanceUrl = $single.find("a.button").attr("href");
      const moreInformation = getMoreInformation(details);
      const languageDetails = basicNormalize(details.language);

      return createPerformance({
        date: parseDate(`${day} ${time}`),
        notesList: [
          calendarNote,
          basicNormalize(moreInformation) === basicNormalize(calendarNote)
            ? undefined
            : moreInformation,
          ...series,
        ],
        url: performanceUrl ?? moviePageUrl,
        screen: getText($single.find("td").eq(2)),
        accessibility: createAccessibility(
          title,
          {
            subtitled:
              languageDetails.includes("with english sub") ||
              languageDetails.includes("with en sub"),
          },
          overview,
        ),
        format: createFormat(title, {}, overview),
      });
    })
    .get();
};

const getSinglePerformance = (
  $,
  $single,
  details,
  moviePageUrl,
  title,
  overview,
  series,
) => {
  const day = $single.find(".timetable .date time").attr("datetime");
  const time = $single.find(".timetable time.time").attr("datetime");
  const calendarNote = getText($single.find(".timetable .calendar-note"));
  const performanceUrl = $single.find(".actions a.button").attr("href");
  const moreInformation = getMoreInformation(details);

  if (basicNormalize(calendarNote) === basicNormalize("Cancelled")) {
    return [];
  }

  // Sometimes we get listing pages without an actual performance date / time
  if (!day || !time) return [];

  return [
    createPerformance({
      date: parseDate(`${day} ${time}`),
      notesList: [
        calendarNote,
        basicNormalize(moreInformation) === basicNormalize(calendarNote)
          ? undefined
          : moreInformation,
        ...series,
      ],
      url: performanceUrl ?? moviePageUrl,
      screen: getText($single.find(".timetable .location")),
      accessibility: createAccessibility(
        title,
        {
          subtitled: basicNormalize(details.language).includes(
            "with english subtitles",
          ),
        },
        overview,
      ),
      format: createFormat(title, {}, overview),
    }),
  ];
};

// A programme of shorts puts its films under a "Programme" heading - each with
// its own director, year and duration - while `.definition` carries only a
// sentence of framing. On those pages the definition alone says a programme
// exists without saying what is in it, which is exactly the information a
// categoriser needs to tell a shorts programme from a feature.
//
// Only matchingHints gets this. `overview` also feeds createFormat, and three
// thousand characters of synopsis is a lot of new surface for a format marker
// to match by accident - a false 35mm is worse than a missing one.
const getProgramme = ($) => {
  const heading = $("h2").filter((_index, element) =>
    /programme/i.test(getText($(element))),
  );
  return heading.length > 0 ? getText(heading.parent()) : "";
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const moviePageUrl in moviePages) {
    const moviePage = moviePages[moviePageUrl];
    const $ = cheerio.load(moviePage);

    const $title = $(".title-dates h1");
    const details = getDetails($, $(".metadata"));
    const shortLinkUrl = $("link[rel='shortlink']").attr("href");
    const id = new URLSearchParams(new URL(shortLinkUrl).search).get("p");
    const title = getText($title);
    const overview = getText($(".definition"));
    const series = getSeries($);

    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url: moviePageUrl,
      overview: getOverview(details),
      performances:
        $("#more-dates").length > 0
          ? getMultiplePerformances(
              $,
              $("#more-dates"),
              details,
              moviePageUrl,
              title,
              overview,
              series,
            )
          : getSinglePerformance(
              $,
              $(".next-showing"),
              details,
              moviePageUrl,
              title,
              overview,
              series,
            ),
      matchingHints: {
        overview: [overview, getProgramme($)].filter(Boolean).join("\n\n"),
      },
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
