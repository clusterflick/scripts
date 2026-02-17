const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  generateShowingId,
  getText,
  basicNormalize,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

const getDetails = ($, $filmInfo) => {
  const details = {};
  $filmInfo.each((i, el) => {
    if (getText($(el)).toLowerCase().startsWith("directed by")) {
      details.directors = getText($(el)).replace(/^Directed by\s+/i, "");
    }
    if (getText($(el)).toLowerCase().startsWith("starring")) {
      details.starring = getText($(el)).replace(/^Starring\s+/i, "");
    }
    if (getText($(el)).match(/^(\d+)\s+mins?/i)) {
      details.duration = getText($(el)).match(/^(\d+)\s+mins?/i);
    }
  });
  return details;
};

const getTrailer = ($trailer) => {
  const trailerUrl = $trailer.attr("href");
  if (!trailerUrl?.includes("youtube.com")) return;
  return trailerUrl.split("/embed/")[1];
};

const extractAccessibilityData = (classList, title, overview) => {
  const className = basicNormalize(classList);

  return createAccessibility(
    title,
    {
      babyFriendly: className.includes("parent-and-baby-screening"),
      hardOfHearing: className.includes("captioned-screening"),
    },
    overview,
  );
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [moviePageUrl, html] of Object.entries(moviePages)) {
    const $ = cheerio.load(html);

    const rawPerformances = JSON.parse(
      getText($('script[type="application/ld+json"]').eq(0)),
    );
    if (rawPerformances.length === 0) continue;

    const id = $("link[rel='shortlink']").attr("href").split("?p=")[1];
    const title = rawPerformances[0].name;
    const details = getDetails($, $(".h-row__film-info li"));
    const trailer = getTrailer($('a[data-fresco-group="trailer"]'));

    const overview = getText($(".c-col-txt"))
      .split("\n")
      .map((value) => value.trim())
      .filter((value) => !!value)
      .join("\n");

    // Extract performances from the booking section
    const additionalDetails = {};
    $(".c-single-performance li.instance").each((i, el) => {
      const $bookingButton = $(el).find(".c-btn");
      $bookingButton.find("span").remove();

      const dateText = getText($(el).find(".c-film-booking__date"));
      const timeText = getText($bookingButton);
      const date = parseDate(`${dateText} ${timeText}`);

      const accessibility = extractAccessibilityData(
        $(el).attr("class"),
        title,
        overview,
      );
      const soldOut = $bookingButton.hasClass("sold-out") || undefined;
      additionalDetails[date.getTime()] = { accessibility, soldOut };
    });

    const performances = rawPerformances.map(({ startDate, offers }) => {
      const date = parseISO(startDate);
      const data = additionalDetails[date.getTime()];
      return createPerformance({
        date,
        url: offers.url,
        accessibility: data?.accessibility,
        status: { soldOut: data?.soldOut },
      });
    });

    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url: moviePageUrl,
      overview: createOverview({
        directors: details.directors,
        actors: details.starring,
        duration: details.duration,
        trailer,
      }),
      performances,
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
