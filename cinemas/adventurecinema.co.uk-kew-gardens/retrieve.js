const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { url } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  // Guard that we loaded the venue page itself, not the listing section: this
  // is a seasonal outdoor venue, and out of season the whole ".upcomingEvents"
  // section is dropped. "body.single-venue" is present whether or not there
  // are shows, so it still catches a redirect/error/redesign while tolerating
  // a legitimate empty season.
  assertSelector(movieListPage, "body.single-venue");

  const $ = cheerio.load(movieListPage);
  const eventUrls = new Set();
  $(".upcomingEvents a[href*='/event/']").each(function () {
    eventUrls.add($(this).attr("href"));
  });

  const moviePages = {};
  for (const eventUrl of [...eventUrls]) {
    moviePages[eventUrl] = await fetchText(eventUrl);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
