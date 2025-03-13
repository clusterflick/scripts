const slugify = require("slugify");
const normalizeTitle = require("../common/normalize-title");
const {
  createOverview,
  getMovieTitleAndYearFrom,
  convertToList,
} = require("../common/utils");
const { searchForBestMatch } = require("../common/get-movie-data");

const args = process.argv.slice(2);
const [name, year, directors = "", actors = "", matchingHints = "{}"] = args;

(async function () {
  const movie = {
    title: name,
    overview: createOverview({
      year,
      directors: convertToList(directors),
      actors: convertToList(actors),
    }),
    matchingHints: JSON.parse(matchingHints),
  };
  const title = normalizeTitle(movie.title, { retainYear: true });
  const { title: normalizedTitle, year: titleYear } =
    getMovieTitleAndYearFrom(title);
  const slug = slugify(normalizedTitle, { strict: true }).toLowerCase();
  const result = await searchForBestMatch({
    normalizedTitle,
    slug,
    movie,
    year: titleYear || movie.overview.year,
  });
  console.log(JSON.stringify(result, null, 4));
})();
