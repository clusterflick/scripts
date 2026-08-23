const cheerio = require("cheerio");
const { fetchText, assertSelector } = require("../../common/utils");
const { url } = require("./attributes");

// Alexandra Palace tags its listings by space rather than by art form: the
// "Film" tag exists in the site's tag cloud but nothing currently carries it,
// including the venue's actual film events. So there is no film listing to
// fetch - this takes the theatre's whole what's-on and leaves categorisation
// to sort films from the comedy and music around them.
async function retrieve() {
  const movieListPage = await fetchText(url);
  assertSelector(movieListPage, ".event_card a.event_target");
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".event_card a.event_target").each(function () {
    const href = $(this).attr("href");
    if (href) moviePageUrls.add(href);
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
