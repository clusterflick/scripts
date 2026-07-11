const cheerio = require("cheerio");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  basicNormalize,
  getText,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");

function formatTable($, $el) {
  return $el
    .find("tr")
    .map((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return null;
      const key = getText(cells.eq(0)).replace(/:$/, "");
      const value = getText(cells.eq(1));
      return key && value ? `${key}: ${value}` : null;
    })
    .get()
    .filter(Boolean)
    .join("\n");
}

function getOverviewData(pageData) {
  const $ = cheerio.load(pageData);
  const data = {};

  // First, try to get data from .event-details .event-detail-section
  $(".event-details .event-detail-section").each(function () {
    const key = basicNormalize(getText($(this).find("div").eq(0)));
    const value = getText($(this).find("div").eq(1));
    switch (key) {
      case "year of release:": {
        data.year = value;
        break;
      }
      case "director:": {
        data.directors = value;
        break;
      }
      case "cast:": {
        data.actors = value;
        break;
      }
    }
  });

  // Also try .te figure table (newer format)
  $(".te figure table tr").each(function () {
    const cells = $(this).find("td");
    if (cells.length < 2) return;
    const key = basicNormalize(getText(cells.eq(0)));
    const value = getText(cells.eq(1));
    switch (key) {
      case "year of release:": {
        data.year = value;
        break;
      }
      case "director:": {
        data.directors = value;
        break;
      }
      case "cast:": {
        data.actors = value;
        break;
      }
      case "age rating:": {
        data.classification = value;
        break;
      }
      case "language:": {
        data.language = value;
        break;
      }
    }
  });

  return data;
}

/**
 * Formats the .te content for use as overview text in matchingHints.
 * Ensures good spacing between paragraphs and formats tables nicely.
 */
function formatOverviewText(pageData) {
  const $ = cheerio.load(pageData);
  const $te = $(".te");
  if (!$te.length) return "";
  return $te
    .children()
    .map((_, el) => {
      const $el = $(el);
      const $table = $el.find("table");
      return $table.length ? formatTable($, $table) : getText($el);
    })
    .get()
    .filter(Boolean)
    .join("\n\n");
}

async function transform({ movieListPage, moviePages }, sourcedEvents) {
  const movies = movieListPage.map((movieData) => {
    const { title, url: urlRaw } = movieData;
    const { year, directors, actors, classification, language } =
      getOverviewData(moviePages[urlRaw]);
    const url = encodeURI(urlRaw);
    const showingId = generateShowingId(attributes, movieData.id);
    const synopsis = formatOverviewText(moviePages[urlRaw]);

    const overview = createOverview({
      duration: movieData.duration.split("minutes")[0].trim(),
      year,
      directors,
      actors,
      classification: movieData.age_rating_class || classification,
    });

    const performances = Object.keys(movieData.performances).flatMap(
      (dayKey) => {
        const dayPerformances = movieData.performances[dayKey];
        return dayPerformances.map(({ timestamp, tag_ids: tags }) => {
          const accessibility = createAccessibility(
            title,
            {
              audioDescription: tags.includes("80879"),
              babyFriendly: tags.includes("80996"),
              hardOfHearing: tags.includes("80832"),
              relaxed: tags.includes("80881"),
              subtitled:
                tags.includes("80883") ||
                basicNormalize(language).includes("with subtitles") ||
                basicNormalize(language).includes("with english subtitles"),
            },
            synopsis,
          );
          const format = createFormat(title, {}, synopsis);

          const notesList = [];
          if (tags.includes("224")) {
            notesList.push("Double bill");
          }
          if (tags.includes("80787")) {
            notesList.push("Silver Screen");
          }
          if (tags.includes("80811")) {
            notesList.push("Q&A");
          }
          if (tags.includes("259")) {
            notesList.push("British Sign Language");
          }
          return createPerformance({
            date: new Date(parseInt(timestamp, 10) * 1000),
            notesList,
            url,
            accessibility,
            format,
          });
        });
      },
    );

    // There have been instances where the same performance is entered multiple
    // times in the data coming back from Riverside Studios. This is a
    // workaround to deduplicate these (and so pass schema validation).
    const uniquePerformances = performances.filter(
      (performance, index, self) => {
        const serialized = JSON.stringify(performance);
        return (
          index === self.findIndex((p) => JSON.stringify(p) === serialized)
        );
      },
    );

    return {
      showingId,
      title,
      url,
      overview,
      performances: uniquePerformances,
      matchingHints: { overview: synopsis },
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
