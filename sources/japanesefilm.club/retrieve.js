const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const attributes = require("./attributes");

// The homepage lists films under a "Now Showing" heading followed by a
// "Past Shows" heading. We only want the events between those two markers.
function getNowShowingMoviePageUrls(movieListPage) {
  const $ = cheerio.load(movieListPage);

  const nowTitle = $(".home_titles").filter(
    (i, el) => $(el).text().trim() === "Now Showing",
  );
  const pastTitle = $(".home_titles.past").filter(
    (i, el) => $(el).text().trim() === "Past Shows",
  );

  if (nowTitle.length === 0 || pastTitle.length === 0) {
    throw new Error(
      `Unable to locate the "Now Showing" / "Past Shows" section markers on ${attributes.url} — the page structure may have changed`,
    );
  }

  const moviePageUrls = [];
  nowTitle
    .nextUntil(pastTitle)
    .find(".event_text")
    .filter((i, el) => !$(el).hasClass("merch_strip"))
    .each((i, el) => {
      const href = $(el).find("h2 a").attr("href");
      if (!href) return;
      const absoluteUrl = new URL(href, attributes.domain).href;
      if (!moviePageUrls.includes(absoluteUrl)) {
        moviePageUrls.push(absoluteUrl);
      }
    });

  return moviePageUrls;
}

async function retrieve() {
  const movieListPage = await fetchText(attributes.url);

  const moviePageUrls = getNowShowingMoviePageUrls(movieListPage);

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
