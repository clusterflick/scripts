const path = require("node:path");
const { getMovieInfoAndCacheResults } = require("../../common/get-movie-data");
const { readJSON } = require("../../common/utils");
const { getAllCinemaNames } = require("../../cinemas");

async function combine() {
  const data = {};
  const cinemas = getAllCinemaNames();
  for (const cinema of cinemas) {
    try {
      const dataPath = path.join(process.cwd(), "transformed-data", cinema);
      data[cinema] = {
        movies: await readJSON(dataPath),
      };
    } catch {
      console.log(`Error caching data for ${cinema}`);
    }
  }

  const movieInfo = {};
  for (const cinema in data) {
    console.log(`[🎞️  Cinema: ${cinema}]`);
    const { movies } = data[cinema];

    for (const { title, themoviedb, themoviedbs } of movies) {
      // Collect all TMDB entries to cache (single + multiple)
      const tmdbEntries = [];
      if (themoviedb) {
        tmdbEntries.push(themoviedb);
      }
      if (themoviedbs) {
        tmdbEntries.push(...themoviedbs);
      }

      for (const tmdbEntry of tmdbEntries) {
        const outputTitle = title.slice(0, 35);
        const start = Date.now();
        process.stdout.write(
          ` - Retriving data for ${"".padEnd(7 - `${tmdbEntry.id}`.length, " ")}[${tmdbEntry.id}] ${outputTitle} ... ${"".padEnd(35 - outputTitle.length, " ")}`,
        );

        if (movieInfo[tmdbEntry.id]) {
          console.log(`\t🆓 Already retrieved`);
          continue;
        }

        try {
          try {
            movieInfo[tmdbEntry.id] =
              await getMovieInfoAndCacheResults(tmdbEntry);
          } catch {
            // Try again to get the data if it fails. The movie info will be
            // cached from the previous run if it was successful.
            process.stdout.write(`\\t🔄`);
            movieInfo[tmdbEntry.id] =
              await getMovieInfoAndCacheResults(tmdbEntry);
          }

          console.log(
            `\t✅ Retrieved (${Math.round((Date.now() - start) / 1000)}s)`,
          );
        } catch (e) {
          console.log(`\t❌ Error retriving`);
          throw e;
        }
      }
    }

    console.log(" ");
  }

  console.log(`➡️  Cached data for ${Object.keys(movieInfo).length} movies`);
  return movieInfo;
}

module.exports = combine;
