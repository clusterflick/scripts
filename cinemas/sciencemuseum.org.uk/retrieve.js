const cheerio = require("cheerio");
const { fetchText, fetchJson } = require("../../common/utils");
const { domain } = require("./attributes");
const {
  getListingRequest,
  isFilmProduction,
  stripClassification,
} = require("./utils");

async function retrieve() {
  const movieListPage = await fetchJson(...getListingRequest());

  // Expand season entries where performances have different titles
  // (e.g. "Star Trek Season" with 12 different films) into individual entries
  const expandedMovieListPage = movieListPage.productions.flatMap((entry) => {
    const uniqueBaseTitles = [
      ...new Set(
        entry.performances.map((p) => stripClassification(p.performanceTitle)),
      ),
    ];
    const isSeason = entry.productionTitle.toLowerCase().endsWith(" season");
    if (uniqueBaseTitles.length <= 1 && !isSeason) return [entry];

    return uniqueBaseTitles.map((baseTitle) => {
      const matchingPerformances = entry.performances.filter(
        (p) => stripClassification(p.performanceTitle) === baseTitle,
      );
      return {
        ...entry,
        productionSeasonId: `${entry.productionSeasonId}-${matchingPerformances[0].id}`,
        performances: matchingPerformances,
        searchTitle: matchingPerformances[0].performanceTitle,
      };
    });
  });

  const moviePages = {};
  const movies = expandedMovieListPage.filter(isFilmProduction);
  for (const movie of movies) {
    const searchTerm = movie.searchTitle || movie.productionTitle;
    const searchResults = await fetchText(
      `${domain}/search?term=${encodeURIComponent(searchTerm)}`,
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
    movieListPage: expandedMovieListPage,
    moviePages,
  };
}

module.exports = retrieve;
