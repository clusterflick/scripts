const cheerio = require("cheerio");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  basicNormalize,
  getText,
} = require("../../common/utils");

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

    const overview = createOverview({
      duration: movieData.run_time.split("mins")[0].trim(),
      year,
      directors,
      actors,
      classification: movieData.event_rating,
    });

    const accessibility = createAccessibility({
      audioDescription: movieData.audio_described === "ad",
      babyFriendly: basicNormalize(movieData.text).startsWith(
        "parent and baby",
      ),
    });
    const performances = Object.keys(movieData.performances).flatMap(
      (dayKey) => {
        const dayPerformances = movieData.performances[dayKey];
        return dayPerformances.map(({ timestamp }) => {
          return createPerformance({
            date: new Date(parseInt(timestamp, 10) * 1000),
            url,
            accessibility,
          });
        });
      },
    );

    return { title, url, overview, performances };
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
