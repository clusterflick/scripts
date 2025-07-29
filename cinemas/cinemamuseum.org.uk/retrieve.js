const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { domain } = require("./attributes");

async function retrieve() {
  let page = 1;
  const moviePageUrls = new Set();

  while (true) {
    const movieListPageUrl = `${domain}/topics/events/page/${page}/`;
    const movieListPage = await fetchText(movieListPageUrl);
    const $ = cheerio.load(movieListPage);
    const $entries = $(".entry_header");

    // Bail out when we find a page with no entries
    if ($entries.length === 0) break;

    page += 1;
    $entries.each(function () {
      const url = $(this).find("a").attr("href");
      moviePageUrls.add(url);
    });
  }

  const moviePages = {};
  for (const moviePageUrl of [...moviePageUrls]) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
    if (moviePages[moviePageUrl].match(/502 Proxy Error/i)) {
      throw new Error(`Proxy error returned for ${moviePageUrl}`);
    }
  }

  return { moviePages };
}

module.exports = retrieve;
