const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { domain } = require("./attributes");

const EVENTS_URL = "https://www.bbk.ac.uk/events?tag=30";

async function retrieve() {
  const movieListPage = await fetchText(EVENTS_URL);

  const $ = cheerio.load(movieListPage);

  const moviePageUrls = [];
  $("#events-listing a.card").each(function () {
    const href = $(this).attr("href");
    const absoluteUrl = new URL(href, domain).href;
    moviePageUrls.push(absoluteUrl);
  });

  const moviePages = {};
  for (const moviePageUrl of moviePageUrls) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
