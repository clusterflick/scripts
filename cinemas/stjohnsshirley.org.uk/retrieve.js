const { startOfDay } = require("date-fns");
const { fetchText } = require("../../common/utils");
const { url } = require("./attributes");
const { parseShowings, parseMoviePage } = require("./utils");

async function retrieve() {
  const movieListPage = await fetchText(url);
  // Parsed here too, so a page that has changed shape fails at retrieve rather
  // than saving something the transform can't read.
  const today = startOfDay(new Date());
  const pageUrls = new Set(
    parseShowings(movieListPage)
      .filter(({ date, url }) => url && date >= today)
      .map(({ url }) => url),
  );

  const moviePages = {};
  for (const pageUrl of pageUrls) {
    const page = await fetchText(pageUrl);
    parseMoviePage(page);
    moviePages[pageUrl] = page;
  }
  return { movieListPage, moviePages };
}

module.exports = retrieve;
