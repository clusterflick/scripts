const cheerio = require("cheerio");
const { format, addMonths } = require("date-fns");
const { fetchText, fetchJson } = require("../../common/utils");
const { domain } = require("./attributes");

const stripClassification = (title) => title.replace(/\s+\([^)]+\)$/i, "");

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
      // Only request 6 months ahead. The science museum doesn't schedule
      // further ahead than that, and requesting 1 year returns an error.
      endDate: `${format(addMonths(now, 6), "yyyy-MM-dd")}T23:59`,
      keywords: [],
    }),
  });

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
  const movies = expandedMovieListPage.filter(
    ({ performances }) => performances[0].productTypeId === 3, // Movie
  );
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
