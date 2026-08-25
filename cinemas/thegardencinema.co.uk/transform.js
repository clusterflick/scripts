const cheerio = require("cheerio");
const {
  convertToList,
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  generateShowingId,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

const isCatchAll = (value) => value.toLowerCase().trim().startsWith("various");

function getStatus($el) {
  return { soldOut: $el.hasClass("sold-out") };
}

function getAccessibility($el) {
  return {
    audioDescription: $el.hasClass("audio_description"),
    hardOfHearing: $el.hasClass("hoh"),
  };
}

function getNotes($el) {
  const notes = [];
  if ($el.hasClass("pay_what_you_can")) {
    notes.push(
      "The screening is Pay What You Can, which means you're free to pay as much or as little as you can afford.",
    );
  }
  if ($el.hasClass("intro")) {
    notes.push("The screening will be introduced.");
  }
  if ($el.hasClass("q_and_a")) {
    notes.push("The screening will be followed by a Q&A.");
  }
  if ($el.hasClass("discussion")) {
    notes.push("The screening will be followed by a discussion.");
  }
  if ($el.hasClass("matinee")) {
    notes.push("Matinee price");
  }
  return notes;
}

function getPerformances($, $filmScreenings, title, overview) {
  const performances = [];
  const $screenings = $filmScreenings.find(".screening-panel");
  $screenings.each(function () {
    // Screenings are grouped by date into a `screening-panel__day` wrapper,
    // which holds the date title alongside that day's list of screenings.
    const screeningDate = getText(
      $(this)
        .closest(".screening-panel__day")
        .find(".screening-panel__date-title"),
    );
    const $screeningTime = $(this).find(".screening-time");
    const screeningTime = getText($screeningTime);
    const date = parseDate(`${screeningDate} T ${screeningTime}`);
    const url = $screeningTime.find("a").attr("href");

    // In the past the Garden cinema has accidentally duplicates all
    // performances, so that they show twice. Detect this and filter them out.
    const isPerformanceDuplicate = performances.find(
      (performance) =>
        performance.time === date.getTime() && performance.bookingUrl === url,
    );
    if (isPerformanceDuplicate) return;

    performances.push(
      createPerformance({
        date,
        notesList: getNotes($(this)),
        url,
        status: getStatus($(this)),
        accessibility: createAccessibility(
          title,
          getAccessibility($(this)),
          overview,
        ),
        format: createFormat(title, {}, overview),
      }),
    );
  });
  return performances;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = moviePages.map((moviePages) => {
    const $ = cheerio.load(moviePages);

    const $title = $(".film-detail__title");

    const $ceritification = $title.find(".film-detail__film__rating");
    const classification = getText($ceritification);
    // Remove the classification element so that it doesn't come up in the title
    // text when we get that later
    $ceritification.remove();

    const $stats = $(".film-detail__film__stats");
    // Remove any links so we just have the raw stats text to parse
    $stats.children().each(function () {
      $(this).remove();
    });
    const stats = convertToList(getText($stats));

    let year;
    let directors = "";

    if (stats.length > 1) {
      directors = isCatchAll(stats[0]) ? "" : stats[0];

      // Sometimes the year position can change. Check in two places, but always
      // make sure we're just getting 4 digits
      const yearInSecondLastPosition = stats[stats.length - 2]?.match(/^\d{4}$/)
        ? stats[stats.length - 2]
        : undefined;
      const yearInThirdLastPosition = stats[stats.length - 3]?.match(/^\d{4}$/)
        ? stats[stats.length - 3]
        : undefined;
      year = yearInSecondLastPosition || yearInThirdLastPosition || undefined;
    }

    const $cast = $(".film-detail__cast");
    $cast.children().each(function () {
      $(this).remove();
    });

    const shortLinkUrl = $("link[rel='shortlink']").attr("href");
    const id = new URLSearchParams(new URL(shortLinkUrl).search).get("p");
    const title = getText($title);

    $(".film-detail__synopsis .info-bar").remove();
    const overview = getText($(".film-detail__synopsis"))
      .replace(/\n(\s*\n)+/gi, "\n\n")
      .trim();

    return {
      showingId: generateShowingId(attributes, id),
      title,
      url: new URL($('link[rel="canonical"]').attr("href")).href,
      overview: createOverview({
        year,
        duration: stats[stats.length - 1]?.replace("m.", ""),
        classification,
        directors,
        actors: getText($cast),
      }),
      performances: getPerformances(
        $,
        $(".film-detail__screenings").eq(0),
        title,
        overview,
      ),
      matchingHints: { overview },
    };
  });

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
