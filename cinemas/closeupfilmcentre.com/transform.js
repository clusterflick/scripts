const cheerio = require("cheerio");
const {
  getText,
  createPerformance,
  createOverview,
} = require("../../common/utils");
const { parseDate } = require("./utils");

const infoMatcher = /^([^,]+),\s+(\d{4}),\s+(\d+)\s+min(\s+|$)/i;

const parseDetailsFrom = (info) => {
  const match = info.match(infoMatcher);
  if (!match) return {};
  const [, directors, year, duration] = match;
  return { directors, year, duration };
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  Object.keys(moviePages).forEach((url) => {
    const moviePage = moviePages[url];
    const $ = cheerio.load(moviePage);
    const $movieListing = $("#film_program_support");
    const titleText = getText($movieListing.find("h1").first());
    const [, ...titlePieces] = titleText.split(":");
    const title = titlePieces.join(":").trim();

    const $info = $movieListing
      .find("p:has(img:first-child:last-child)")
      .next();
    $info.find("strong").remove(); // Remove title if it's present
    const info = getText($info);
    const overview = createOverview(parseDetailsFrom(info));

    const performances = [];
    $(".booking_calender #addform tr#row").each(function () {
      const $cells = $(this).find("td");
      const dateString = getText($cells.eq(1));
      const timeString = getText($cells.eq(2));
      const date = parseDate(`${dateString} @ ${timeString}`);
      const url = $cells.eq(3).find("a").attr("href");
      performances.push(createPerformance({ date, url }));
    });

    movies.push({ title, url, overview, performances });
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
