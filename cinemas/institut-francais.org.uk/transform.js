const cheerio = require("cheerio");
const {
  createOverview,
  getText,
  createPerformance,
  createAccessibility,
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
) => {
  return $multiple
    .find("tbody tr")
    .map((i, el) => {
      const $single = $(el);
      const day = $single.find("time.date").attr("datetime");
      const time = $single.find("time.time").attr("datetime");
      const calendarNote = getText($single.find(".calendar-note"));
      const performanceUrl = $single.find("a.button").attr("href");
      const moreInformation = details["more information"];
      const languageDetails = basicNormalize(details.language);

      return createPerformance({
        date: parseDate(`${day} ${time}`),
        notesList: [
          calendarNote,
          basicNormalize(moreInformation) === basicNormalize(calendarNote)
            ? undefined
            : moreInformation,
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
) => {
  const day = $single.find(".timetable .date time").attr("datetime");
  const time = $single.find(".timetable time.time").attr("datetime");
  const calendarNote = getText($single.find(".timetable .calendar-note"));
  const performanceUrl = $single.find(".actions a.button").attr("href");
  const moreInformation = details["more information"];

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
    }),
  ];
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
            )
          : getSinglePerformance(
              $,
              $(".next-showing"),
              details,
              moviePageUrl,
              title,
              overview,
            ),
      matchingHints: { overview },
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
