const path = require("node:path");
const { readJSON } = require("../../common/utils");
const { getMovieInfoAndCacheResults } = require("../../common/get-movie-data");
const findRottenTomatoesMatch = require("./find-rotten-tomatoes-match");
const findMetacriticMatch = require("./find-metacritic-match");
const findLetterboxdMatch = require("./find-letterboxd-match");
const findImdbMatch = require("./find-imdb-match");
const findBechdelMatch = require("./find-bechdel-match");
const findMovieDbMatch = require("./find-moviedb-match");
const {
  withPlaywrightSession,
} = require("../../common/get-page-with-playwright");

async function match(source) {
  const dataPath = path.join(
    process.cwd(),
    "combined-data",
    "combined-data.json",
  );
  const combinedData = await readJSON(dataPath);
  const cachePath = path.join(
    process.cwd(),
    "cached-data",
    "moviedb-data.json",
  );
  let cache = {};
  try {
    cache = await readJSON(cachePath);
  } catch {
    console.log("⚠️ Unable to load cached data");
  }
  const data = {};

  // Collect all movies to match (root level + includedMovies)
  const moviesToMatch = [];
  Object.values(combinedData.movies).forEach((movie) => {
    moviesToMatch.push(movie);
    if (movie.includedMovies && movie.includedMovies.length > 0) {
      moviesToMatch.push(...movie.includedMovies);
    }
  });

  let meta = { index: 0, withInfo: 0, matched: 0 };

  // Letterboxd is the only Playwright-backed source, and it fetches a page per
  // movie - so the whole loop runs inside one session, sharing a single browser
  // across every film. `getPage` is undefined for the other (fetch-based)
  // sources. The browser launches lazily on the first cache miss, so a
  // fully-cached run still launches nothing.
  const matchMovies = async (getPage) => {
    for (const movie of moviesToMatch) {
      meta.index++;
      const outputTitle = movie.title.slice(0, 35);
      const start = Date.now();
      process.stdout.write(
        `[${meta.index} of ${moviesToMatch.length}]\t- Matching data for ${outputTitle} ... ${"".padEnd(35 - outputTitle.length, " ")}`,
      );

      if (movie.isUnmatched) {
        console.log(`\t🔘 No data to match`);
        continue;
      }

      meta.withInfo++;
      let matchData;
      if (source === "rottentomatoes") {
        const movieInfo =
          cache[movie.id] || (await getMovieInfoAndCacheResults(movie));
        matchData = await findRottenTomatoesMatch(movieInfo);
      } else if (source === "metacritic") {
        const movieInfo =
          cache[movie.id] || (await getMovieInfoAndCacheResults(movie));
        matchData = await findMetacriticMatch(movieInfo);
      } else if (source === "letterboxd") {
        const movieInfo =
          cache[movie.id] || (await getMovieInfoAndCacheResults(movie));
        matchData = await findLetterboxdMatch(movieInfo, getPage);
      } else if (source === "moviedb") {
        const movieInfo =
          cache[movie.id] || (await getMovieInfoAndCacheResults(movie));
        matchData = await findMovieDbMatch(movieInfo);
      } else if (source === "imdb") {
        matchData = await findImdbMatch(movie);
      } else if (source === "bechdel") {
        matchData = await findBechdelMatch(movie);
      } else {
        console.log(`\t❌ Error`);
        throw new Error(`Unknown source "${source}"`);
      }

      if (!matchData) {
        console.log(`\t☑️  No match found`);
        continue;
      }

      meta.matched++;
      data[movie.id] = matchData;
      console.log(`\t✅ Matched (${Math.round((Date.now() - start) / 1000)}s)`);
    }
  };

  if (source === "letterboxd") {
    await withPlaywrightSession(matchMovies);
  } else {
    await matchMovies();
  }

  console.log(
    `\nMatched ${meta.matched} of ${moviesToMatch.length} movies (and ${meta.withInfo} which contained info)`,
  );

  return data;
}

module.exports = match;
