const cheerio = require("cheerio");
const {
  fetchText,
  assertSelector,
  getListingLinks,
} = require("../../common/utils");
const { url, domain } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".eventlist--past,.eventlist--upcoming");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set(
    getListingLinks(
      $,
      $(".eventlist--upcoming .eventlist-event"),
      ".eventlist-title-link",
    ).map((href) => `${domain}${href}`),
  );

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
