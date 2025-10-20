const path = require("node:path");
const { readJSON } = require("../../common/utils");
const { getMovieInfoAndCacheResults } = require("../../common/get-movie-data");
const findRottenTomatoesMatch = require("./find-rotten-tomatoes-match");
const findMetacriticMatch = require("./find-metacritic-match");
const findLetterboxdMatch = require("./find-letterboxd-match");
const findImdbMatch = require("./find-imdb-match");

async function match(source) {
  const dataPath = path.join(
    process.cwd(),
    "combined-data",
    "combined-data.json",
  );
  const combinedData = await readJSON(dataPath);
  const data = {};

  const movies = Object.values(combinedData.movies);
  let meta = { index: 0, withInfo: 0, matched: 0 };
  for (const movie of movies) {
    meta.index++;
    const outputTitle = movie.title.slice(0, 35);
    const start = Date.now();
    process.stdout.write(
      `[${meta.index} of ${movies.length}]\t- Matching data for ${outputTitle} ... ${"".padEnd(35 - outputTitle.length, " ")}`,
    );

    if (movie.isUnmatched) {
      console.log(`\t🔘 No data to match`);
      continue;
    }

    meta.withInfo++;
    let matchData;
    if (source === "rottentomatoes") {
      const movieInfo = await getMovieInfoAndCacheResults(movie);
      matchData = await findRottenTomatoesMatch(movieInfo);
    } else if (source === "metacritic") {
      const movieInfo = await getMovieInfoAndCacheResults(movie);
      matchData = await findMetacriticMatch(movieInfo);
    } else if (source === "letterboxd") {
      const movieInfo = await getMovieInfoAndCacheResults(movie);
      matchData = await findLetterboxdMatch(movieInfo);
    } else if (source === "imdb") {
      matchData = await findImdbMatch(movie);
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

  console.log(
    `\nMatched ${meta.matched} of ${movies.length} movies (and ${meta.withInfo} which contained info)`,
  );

  return data;
}

module.exports = match;
