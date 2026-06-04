const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { url, domain } = require("./attributes");

async function retrieve() {
  // The ICA's /upcoming page returns a 404 status but still serves valid HTML
  // with all the film listings — this appears to be a server misconfiguration.
  // We accept 404 here but still throw on other error statuses (e.g. 500).
  const movieListResponse = await fetch(url);
  if (!movieListResponse.ok && movieListResponse.status !== 404) {
    throw new Error(
      `Failed to fetch ${url}: ${movieListResponse.status} ${movieListResponse.statusText}`,
    );
  }
  const movieListPage = await movieListResponse.text();
  assertSelector(movieListPage, ".item.films");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".item.films").each(function () {
    const url = $(this).children("a").attr("href");
    moviePageUrls.add(`${domain}${url}`);
  });

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
