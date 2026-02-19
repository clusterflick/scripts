const cheerio = require("cheerio");
const { fetchText, fetchJson } = require("../../common/utils");
const { url, domain } = require("./attributes");

async function retrieve() {
  const movieListPage = await fetchText(url);
  const $ = cheerio.load(movieListPage);

  const screeningIds = new Set();
  $("main a.block").each(function () {
    const href = $(this).attr("href");
    const match = href.match(/\/screening\/(\d+)/);
    if (match) {
      screeningIds.add(match[1]);
    }
  });

  if (screeningIds.size === 0) {
    throw new Error("No screenings found. Has the page data changed?");
  }

  const screenings = [];
  for (const id of screeningIds) {
    const screening = await fetchJson(`${domain}/api/screenings/${id}`);
    if (screening.error) {
      throw new Error(`API error for screening ${id}: ${screening.error}`);
    }
    screenings.push(screening);
  }

  return { movieListPage, screenings };
}

module.exports = retrieve;
