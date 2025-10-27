const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { domain } = require("./attributes");

/**
 * Extract unique movie URLs from an HTML page
 * @param {string} html - The HTML content
 * @returns {Set<string>} - Set of unique movie URLs
 */
function extractMovieUrls(html) {
  const $ = cheerio.load(html);
  return $(".title-wrapper .img a")
    .map((i, el) => $(el).attr("href"))
    .get();
}

async function retrieve() {
  const outNowUrl = `${domain}/films/out-now`;
  const comingSoonUrl = `${domain}/films/coming-soon`;

  const outNowHtml = await fetchText(outNowUrl);
  const comingSoonHtml = await fetchText(comingSoonUrl);

  const outNowUrls = extractMovieUrls(outNowHtml);
  const comingSoonUrls = extractMovieUrls(comingSoonHtml);
  const allMovieUrls = new Set([...outNowUrls, ...comingSoonUrls]);

  const moviePages = {};
  for (const movieUrl of allMovieUrls) {
    moviePages[movieUrl] = await fetchText(movieUrl);
  }

  return {
    movieListPages: [outNowHtml, comingSoonHtml],
    moviePages,
  };
}

module.exports = retrieve;
