const cheerio = require("cheerio");
const {
  convertToList,
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
} = require("../../common/utils");
const { parseDate } = require("./utils");

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

function getPerformances($, $filmScreenings) {
  const performances = [];
  const $screenings = $filmScreenings.find(".screening-panel");
  $screenings.each(function (index) {
    let $screeningDate = $(this).find(".screening-panel__date-title");
    // Note: This will break if the venue only ever has more than 2 performances
    // in a single day
    if ($screeningDate.length === 0) {
      $screeningDate = $screenings
        .eq(index - 1)
        .find(".screening-panel__date-title");
    }
    const $screeningTime = $(this).find(".screening-time");

    const date = parseDate(
      `${getText($screeningDate)} T ${getText($screeningTime)}`,
    );

    performances.push(
      createPerformance({
        date,
        notesList: getNotes($(this)),
        url: $screeningTime.find("a").attr("href"),
        status: getStatus($(this)),
        accessibility: createAccessibility(getAccessibility($(this))),
      }),
    );
  });
  return performances;
}

async function transform({ movieListPage, moviePages }, sourcedEvents) {
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
      year = isCatchAll(stats[stats.length - 2])
        ? undefined
        : stats[stats.length - 2];
    }

    const $cast = $(".film-detail__cast");
    $cast.children().each(function () {
      $(this).remove();
    });

    return {
      title: getText($title),
      url: $('link[rel="canonical"]').attr("href"),
      overview: createOverview({
        year,
        duration: stats[stats.length - 1].replace("m.", ""),
        classification,
        directors,
        actors: getText($cast),
      }),
      performances: getPerformances($, $(".film-detail__screenings").eq(0)),
    };
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
