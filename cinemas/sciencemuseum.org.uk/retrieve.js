const cheerio = require("cheerio");
const { format, addYears } = require("date-fns");
const { fetchText, fetchJson } = require("../../common/utils");
const { domain } = require("./attributes");

async function retrieve() {
  const movieListPageUrl = `https://my.sciencemuseum.org.uk/api/products/productionseasons`;
  const now = new Date();
  const movieListPage = await fetchJson(movieListPageUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      productionSeasonIdFilter: [],
      keywordIds: null,
      startDate: `${format(now, "yyyy-MM-dd")}T00:00`,
      endDate: `${format(addYears(now, 1), "yyyy-MM-dd")}T23:59`,
      keywords: [],
    }),
  });

  const moviePages = {};
  const movies = movieListPage.filter(
    ({ performances }) => performances[0].productTypeId === 3, // Movie
  );
  for (const movie of movies) {
    const searchResults = await fetchText(
      `${domain}/search?term=${encodeURIComponent(movie.productionTitle)}`,
    );
    const $ = cheerio.load(searchResults);
    const resultPath = $(".c-search-results__item")
      .eq(0)
      .find("h2 a")
      .attr("href");
    movie.moviePageUrl = `${domain}${resultPath}`;
    moviePages[movie.moviePageUrl] = await fetchText(movie.moviePageUrl);
  }

  return {
    movieListPage,
    moviePages,
  };
}

module.exports = retrieve;
