const cheerio = require("cheerio");
const { parse, set } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
  generateShowingId,
  getValidClassification,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");

function fixHtmlTypos(html) {
  return html.replace(/<soan /g, "<span ");
}

function extractDurationInMinutes(durationText) {
  if (!durationText) return undefined;
  const hoursMatch = durationText.match(/(\d+)\s*hr/i);
  const minutesMatch = durationText.match(/(\d+)\s*min/i);
  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  return hours * 60 + minutes;
}

function parseMovieDetails(html) {
  const correctedHtml = fixHtmlTypos(html);
  const $ = cheerio.load(correctedHtml);

  const title = getText($("h1.OMP_bannerTitle"));

  // Find "Running Time" and get the next p tag
  let runningTime;
  $("p strong").each(function () {
    if (getText($(this)) === "Running Time") {
      runningTime = getText($(this).parent().next("p.OMP_colourD"));
    }
  });

  // Find sections within OMP_descriptionSection
  let description, starring, director, genres;
  $(".OMP_descriptionSection h6").each(function () {
    const heading = getText($(this));
    const value = getText($(this).next("p.OMP_colourD"));

    if (heading === "Description") {
      description = value;
    } else if (heading === "Starring") {
      starring = value;
    } else if (heading === "Director") {
      director = value;
    } else if (heading === "Genres") {
      genres = value;
    }
  });

  // Extract BBFC rating (UK rating)
  const ratingImg = $('img[title*="BBFC"]').attr("title");
  const ratingMatch = ratingImg?.match(/BBFC\s*-\s*(\S+)/);
  const classification = ratingMatch ? ratingMatch[1] : undefined;

  return {
    title,
    runningTime,
    description,
    starring,
    director,
    genres,
    classification,
  };
}

function extractPerformances($eventWrapper, $, movieTitle) {
  const performances = [];

  $eventWrapper.find(".OMP_listingDate").each(function () {
    const $dateSection = $(this);
    const dateStr = $dateSection.attr("data-date"); // e.g., "11-11-2025"
    const baseDate = parse(dateStr, "dd-MM-yyyy", new Date(), {
      locale: enGB,
    });

    $dateSection.find(".OMP_buttonSelection").each(function () {
      const $showtime = $(this);
      const timeText = getText($showtime.find(".time").first());
      const timeMatch = timeText.match(/^(\d{1,2}):(\d{2})/);

      if (!timeMatch) return;

      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const performanceDate = set(baseDate, { hours, minutes, seconds: 0 });

      const url = $showtime.attr("href");
      const screen = getText($showtime.find(".hall"));
      const accessText = basicNormalize(
        getText($showtime.find(".omp_accessText")),
      );
      const additionalLabels = basicNormalize(
        getText($showtime.find(".price")),
      );
      const accessibilityNotes = `${additionalLabels} ${accessText}`;
      const typeImg = $showtime.find(".OMP_perfTypeImage").attr("title");

      performances.push(
        createPerformance({
          date: performanceDate,
          url: () => url,
          screen,
          accessibility: createAccessibility(movieTitle, {
            hardOfHearing: accessibilityNotes.includes("audio description"),
            subtitled: accessibilityNotes.includes("subtitle"),
            relaxed: accessibilityNotes.includes("sensory"),
            babyFriendly: accessibilityNotes.includes("kids club"),
          }),
          attributes: typeImg ? [typeImg] : undefined,
        }),
      );
    });
  });

  return performances;
}

async function transform({ movieListPage, moviePages }, sourcedEvents) {
  const movies = [];
  const correctedListPage = fixHtmlTypos(movieListPage);
  const $ = cheerio.load(correctedListPage);

  // Process each movie on the listing page
  $(".OMP_eventWrapper").each(function () {
    const $eventWrapper = $(this);
    const eventId = $eventWrapper.attr("id");

    // Get movie title and link from the listing page
    const movieUrl = $eventWrapper
      .find('a[href*="/whatson/movie/showtimes/"]')
      .first()
      .attr("href");

    // Build full URL
    const fullMovieUrl = movieUrl.startsWith("http")
      ? movieUrl
      : `${attributes.domain}${movieUrl}`;

    const movieDetails = parseMovieDetails(moviePages[fullMovieUrl]);
    const performances = extractPerformances(
      $eventWrapper,
      $,
      movieDetails.title,
    );
    if (performances.length === 0) return;

    movies.push({
      showingId: generateShowingId(attributes, eventId),
      title: movieDetails.title,
      url: fullMovieUrl,
      overview: createOverview({
        duration: extractDurationInMinutes(movieDetails.runningTime),
        categories: movieDetails.genres,
        classification: getValidClassification(movieDetails.classification),
        directors: movieDetails.director,
        actors: movieDetails.starring,
      }),
      performances,
      matchingHints: {
        overview: movieDetails.description,
      },
    });
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
