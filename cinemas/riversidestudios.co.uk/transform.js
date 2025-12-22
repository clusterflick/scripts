const cheerio = require("cheerio");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  basicNormalize,
  getText,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");

function getOverviewData(pageData) {
  const $ = cheerio.load(pageData);
  const data = {};
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
  return data;
}

async function transform({ movieListPage, moviePages }, sourcedEvents) {
  const movies = movieListPage.map((movieData) => {
    const { title, url: urlRaw } = movieData;
    const { year, directors, actors } = getOverviewData(moviePages[urlRaw]);
    const url = encodeURI(urlRaw);
    const showingId = generateShowingId(attributes, movieData.id);

    const overview = createOverview({
      duration: movieData.duration.split("minutes")[0].trim(),
      year,
      directors,
      actors,
      classification: movieData.age_rating_class,
    });

    const performances = Object.keys(movieData.performances).flatMap(
      (dayKey) => {
        const dayPerformances = movieData.performances[dayKey];
        return dayPerformances.map(({ timestamp, tag_ids: tags }) => {
          const accessibility = createAccessibility({
            audioDescription: tags.includes("80879"),
            babyFriendly: tags.includes("80996"),
            hardOfHearing: tags.includes("80832"),
            relaxed: tags.includes("80881"),
            subtitled: tags.includes("80883"),
          });

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
      matchingHints: {
        overview: getText(cheerio.load(moviePages[urlRaw])(".te")),
      },
    };
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
