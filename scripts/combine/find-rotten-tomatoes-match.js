const slugify = require("slugify");
const cheerio = require("cheerio");
const { dailyCache } = require("../../common/cache");
const {
  fetchText,
  getText,
  basicNormalize,
  compareAsSimilar,
} = require("../../common/utils");
const normalizeTitle = require("../../common/normalize-title");
const normalizeName = require("../../common/normalize-name");

const getSearchResults = async (movieTitle, movieYear) => {
  const slug = slugify(movieTitle, { strict: true }).toLowerCase();
  const cacheYear = movieYear ?? "no-year";
  const cacheKey = `rotten-tomatoes-search-${cacheYear}-${slug}`;
  const rottenTomatoesSearch = await dailyCache(cacheKey, async () =>
    fetchText(
      `https://www.rottentomatoes.com/search?search=${encodeURIComponent(movieTitle)}`,
    ),
  );

  const $ = cheerio.load(rottenTomatoesSearch);
  return $("search-page-result")
    .find("search-page-media-row")
    .map((i, el) => {
      const $title = $(el).find("[data-qa='info-name']");
      return {
        // Replace hyphen with dash so that normalization doesn't strip out
        // important information.
        title: getText($title).replaceAll(" - ", " – "),
        url: $title.attr("href"),
        year: $(el).attr("releaseyear"),
      };
    })
    .get();
};

const getMoviePage = async (movieTitle, movieYear, match) => {
  const slug = slugify(movieTitle, { strict: true }).toLowerCase();
  const cacheYear = movieYear ?? "no-year";
  const cacheKey = `rotten-tomatoes-get-${cacheYear}-${slug}`;
  return await dailyCache(cacheKey, async () => fetchText(match.url));
};

const getDirectorsForMatch = async (movieTitle, movieYear, match) => {
  const matchPage = await getMoviePage(movieTitle, movieYear, match);
  const $matchPage = cheerio.load(matchPage);
  const $directorRoles = $matchPage(
    ".cast-and-crew p[class='role']:contains('Director')",
  );
  return $directorRoles.map((i, el) => getText($matchPage(el).prev())).get();
};

const getNameOptions = (name) => [
  normalizeName(name),
  // Reverse order of names
  normalizeName(name.split(" ").reverse().join(" ")),
  // Remove middle names
  normalizeName(`${name.split(" ").at(0)} ${name.split(" ").at(-1)}`),
];

const getDirectors = (credits) =>
  (credits?.crew ?? [])
    .filter(({ job }) => basicNormalize(job) === "director")
    .flatMap(({ name }) => getNameOptions(name));

const getMatchFromSearchResults = async (movie, searchResults, matcher) => {
  const match = searchResults.find(
    ({ title, year }) =>
      normalizeTitle(title) === normalizeTitle(movie.title) &&
      matcher({ title, year }, movie),
  );
  if (!match) return;

  const directorsForMatch = await getDirectorsForMatch(
    movie.title,
    movie.year,
    match,
  );
  if (directorsForMatch.length === 0) return;

  const directorsForMatchOptions = directorsForMatch.flatMap(getNameOptions);
  const matchingDirector = getDirectors(movie.credits).find((movieDirector) =>
    directorsForMatchOptions.some((directorForMatchOption) =>
      compareAsSimilar(
        normalizeName(movieDirector),
        normalizeName(directorForMatchOption),
      ),
    ),
  );
  if (matchingDirector) return match;
};

const getMatch = async (movie) => {
  const searchResults = await getSearchResults(movie.title, movie.year);

  const matcher = (searchResult, movie) => {
    const searchResultYear = parseInt(searchResult.year, 10);
    const movieYear = parseInt(movie.year, 10);
    return (
      searchResultYear >= movieYear - 1 && searchResultYear <= movieYear + 1
    );
  };
  const match = await getMatchFromSearchResults(movie, searchResults, matcher);
  if (match) return match;

  const broaderMatcher = (searchResult, movie) => {
    const searchResultYear = parseInt(searchResult.year, 10);
    const movieYear = parseInt(movie.year, 10);
    return (
      searchResultYear >= movieYear - 7 && searchResultYear <= movieYear + 7
    );
  };
  const closeMatch = await getMatchFromSearchResults(
    movie,
    searchResults,
    broaderMatcher,
  );
  if (closeMatch) return closeMatch;
};

const getScoresFor = (group) => ({
  likes: group.likedCount,
  dislikes: group.notLikedCount,
  reviews: group.reviewCount,
  rating: group.averageRating,
  score: group.score,
});

const getScore = async ({ title, year, match }) => {
  const rottenTomatoesGet = await getMoviePage(title, year, match);
  const $ = cheerio.load(rottenTomatoesGet);
  const scorecard = JSON.parse(getText($("#media-scorecard-json")));
  return {
    url: match.url,
    audience: {
      all: getScoresFor(scorecard.overlay.audienceAll),
      verified: getScoresFor(scorecard.overlay.audienceVerified),
    },
    critics: {
      all: getScoresFor(scorecard.overlay.criticsAll),
      top: getScoresFor(scorecard.overlay.criticsTop),
    },
  };
};

async function findRottenTomatoesMatch({
  title,
  release_date: releaseDate,
  credits,
}) {
  const year = releaseDate.split("-")[0];
  const match = await getMatch({ title, year, credits });
  if (!match) return undefined;

  const score = await getScore({ title, year, match });
  if (!score) return undefined;

  return score;
}

module.exports = findRottenTomatoesMatch;
