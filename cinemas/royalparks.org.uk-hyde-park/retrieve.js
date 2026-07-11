const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");

// Hyde Park's outdoor cinema screenings are listed on the BST Hyde Park "Open
// House" microsite (AEG), which is separate from the venue's Royal Parks page.
const listingDomain = "https://www.bst-hydepark.com";
const listingUrl = `${listingDomain}/open-house/`;

async function retrieve() {
  const movieListPage = await fetchText(listingUrl);
  const $ = cheerio.load(movieListPage);

  const moviePageUrls = new Set();
  $(".filterable-card__card").each(function () {
    const searchText = $(this).attr("data-search-text") || "";
    if (!searchText.toLowerCase().includes("cinema")) return;

    const href = $(this).find("a.cover-link").first().attr("href");
    if (href) moviePageUrls.add(`${listingDomain}${href}`);
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
