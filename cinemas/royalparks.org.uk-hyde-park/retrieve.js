const cheerio = require("cheerio");
const { fetchText, getListingLinks } = require("../../common/utils");

// Hyde Park's outdoor cinema screenings are listed on the BST Hyde Park "Open
// House" microsite (AEG), which is separate from the venue's Royal Parks page.
const listingDomain = "https://www.bst-hydepark.com";
const listingUrl = `${listingDomain}/open-house/`;

async function retrieve() {
  const movieListPage = await fetchText(listingUrl);
  const $ = cheerio.load(movieListPage);

  const cinemaCards = $(".filterable-card__card").filter(function () {
    const searchText = $(this).attr("data-search-text") || "";
    return searchText.toLowerCase().includes("cinema");
  });
  const moviePageUrls = new Set(
    getListingLinks($, cinemaCards, "a.cover-link").map(
      (href) => `${listingDomain}${href}`,
    ),
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
