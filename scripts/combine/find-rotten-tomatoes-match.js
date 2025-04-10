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

const getMoviePage = async (movieTitle, movieYear, match) => {
  const slug = slugify(movieTitle, { strict: true }).toLowerCase();
  const cacheYear = movieYear ?? "no-year";
  const cacheKey = `rotten-tomatoes-get-${cacheYear}-${slug}`;
  return await dailyCache(cacheKey, async () => fetchText(match.url));
};

const getDirectors = (credits) =>
  (credits?.crew ?? [])
    .filter(({ job }) => basicNormalize(job) === "director")
    .map(({ name }) => normalizeName(name));

const getMatch = async (movieTitle, movieYear, credits) => {
  const slug = slugify(movieTitle, { strict: true }).toLowerCase();
  const cacheYear = movieYear ?? "no-year";
  const cacheKey = `rotten-tomatoes-search-${cacheYear}-${slug}`;
  const rottenTomatoesSearch = await dailyCache(cacheKey, async () =>
    fetchText(
      `https://www.rottentomatoes.com/search?search=${encodeURIComponent(movieTitle)}`,
    ),
  );

  const $ = cheerio.load(rottenTomatoesSearch);
  const searchResults = $("search-page-result")
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

  const movieReleaseYear = parseInt(movieYear, 10);

  const isDebug = normalizeTitle(movieTitle) === "my name is eftyhia";
  if (isDebug) console.log(" || ");

  const match = searchResults.find(({ title, year }) => {
    if (isDebug)
      console.log(
        ">>> compare titles",
        normalizeTitle(title) === normalizeTitle(movieTitle),
        normalizeTitle(title),
        normalizeTitle(movieTitle),
      );
    return (
      normalizeTitle(title) === normalizeTitle(movieTitle) &&
      (year === movieYear ||
        year === `${movieReleaseYear - 1}` ||
        year === `${movieReleaseYear + 1}`)
    );
  });

  if (match) return match;

  const closeMatches = searchResults.filter(
    ({ title, year }) =>
      normalizeTitle(title) === normalizeTitle(movieTitle) &&
      // Widen the year gap to anything + or - 7 years from expected
      parseInt(year, 10) >= movieReleaseYear - 7 &&
      parseInt(year, 10) <= movieReleaseYear + 7,
  );

  // If we don't get just one close match, bail out
  if (closeMatches.length !== 1) return undefined;

  const closeMatch = closeMatches[0];
  const closeMatchPage = await getMoviePage(movieTitle, movieYear, closeMatch);
  const $closeMatchPage = cheerio.load(closeMatchPage);
  const $directorRole = $closeMatchPage(
    ".cast-and-crew p[class='role']:contains('Director')",
  ).eq(0);
  if ($directorRole) {
    const director = normalizeName(getText($directorRole.prev()));
    const matchingDirector = getDirectors(credits).find((movieDirector) =>
      compareAsSimilar(movieDirector, director),
    );
    if (matchingDirector) return closeMatch;
  }
};

const getScoresFor = (group) => ({
  likes: group.likedCount,
  dislikes: group.notLikedCount,
  reviews: group.reviewCount,
  rating: group.averageRating,
  score: group.score,
});

const getScore = async (movieTitle, movieYear, match) => {
  const rottenTomatoesGet = await getMoviePage(movieTitle, movieYear, match);
  const $ = cheerio.load(rottenTomatoesGet);
  const scorecard = JSON.parse(getText($("#media-scorecard-json")));
  return {
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
  const match = await getMatch(title, year, credits);
  if (!match) return undefined;

  const score = await getScore(title, year, match);
  if (!score) return undefined;

  return score;
}

module.exports = findRottenTomatoesMatch;
