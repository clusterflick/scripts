const cheerio = require("cheerio");
const { fetchText, getText } = require("../../common/utils");
const { domain } = require("./attributes");

const getPageUrl = (page = 1) =>
  page === 1 ? `${domain}/whats-on` : `${domain}/whats-on/page/${page}`;

function getTotalPages($) {
  const pageNumbers = $(".pagination .page-numbers")
    .map((i, el) => {
      const num = parseInt(getText($(el)), 10);
      return isNaN(num) ? null : num;
    })
    .get()
    .filter((num) => num !== null);

  return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
}

function getEventUrls($) {
  return $("a")
    .filter((i, el) => getText($(el)) === "Read More")
    .map((i, el) => $(el).attr("href"))
    .get();
}

async function retrieve() {
  const movieListPages = [];
  const urls = new Set();

  // Fetch the first page to determine total pages from pagination
  const firstPage = await fetchText(getPageUrl(1));
  movieListPages.push(firstPage);

  const $ = cheerio.load(firstPage);
  const totalPages = getTotalPages($);

  getEventUrls($).forEach((url) => urls.add(url));
  for (let page = 2; page <= totalPages; page++) {
    const pageHtml = await fetchText(getPageUrl(page));
    movieListPages.push(pageHtml);

    const $page = cheerio.load(pageHtml);
    getEventUrls($page).forEach((url) => urls.add(url));
  }

  // Fetch individual event pages
  const moviePages = {};
  for (const url of Array.from(urls)) {
    moviePages[url] = await fetchText(url);
  }

  return {
    movieListPages,
    moviePages,
  };
}

module.exports = retrieve;
