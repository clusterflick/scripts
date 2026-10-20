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

const getSeriesPath = (href) => new URL(href, attributes.url).pathname;

// The listing page's "Festivals & Series" tab has a card for every series the
// venue is running, and each card carries the venue's own terms. A festival or
// a programmed season - "Film Africa 2026", "Nathalie Baye: A Hundred Lives" -
// is filed under "Festivals & Series". The venue's standing shelves are not:
// "Highlights of the Month", "Relaxed Screenings", and cross-arts themes such
// as "Women Shaping the World". Returns each series' path mapped to whether
// it is one of the former.
const getSeriesKinds = (movieListPage) => {
  const $ = cheerio.load(movieListPage);
  const kinds = new Map();
  $("#tab-festivals .card--festival").each((_index, element) => {
    const href = $(element).find("a").first().attr("href");
    if (!href) return;
    const terms = $(element)
      .find(".card__terms .tag")
      .map((_termIndex, term) => getText($(term)))
      .get();
    kinds.set(getSeriesPath(href), terms.includes("Festivals & Series"));
  });
  return kinds;
};

// The film's own series are the tags under its title that link to a
// "festivals-and-series" page; the other tags ("Films", "New Releases") link
// nowhere, and the related-films cards further down the page link to series
// too, which is why only the title block is read.
//
// Only a festival or programmed season earns a note. A shelf would be wrong as
// one, not merely noisy: a series tag belongs to the film, so its note lands on
// every performance - "Relaxed Screenings" marked all three of a film's
// showings as relaxed when one was, and "Highlights of the Month" was still on
// screenings two months out.
//
// A tag with no card in the listing means the two have stopped lining up, so
// it throws rather than guess which kind of series it is.
const getSeries = ($, seriesKinds, title) =>
  $(".film-introduction .title-dates .tags .tags__tag a")
    .map((_index, element) => {
      const href = $(element).attr("href");
      if (!href) return null;
      const path = getSeriesPath(href);
      if (!path.startsWith("/festivals-and-series/")) return null;
      if (!seriesKinds.has(path)) {
        throw new Error(
          `"${title}" is tagged with a series the listing has no card for: ${path}`,
        );
      }
      return seriesKinds.get(path) ? getText($(element)) : null;
    })
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

async function transform({ movieListPage, moviePages }, sourcedEvents) {
  const movies = [];
  const seriesKinds = getSeriesKinds(movieListPage);

  for (const moviePageUrl in moviePages) {
    const moviePage = moviePages[moviePageUrl];
    const $ = cheerio.load(moviePage);

    const $title = $(".title-dates h1");
    const details = getDetails($, $(".metadata"));
    const shortLinkUrl = $("link[rel='shortlink']").attr("href");
    const id = new URLSearchParams(new URL(shortLinkUrl).search).get("p");
    const title = getText($title);
    const overview = getText($(".definition"));
    const series = getSeries($, seriesKinds, title);

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
