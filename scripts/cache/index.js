const path = require("node:path");
const getModuleNamesFor = require("../../common/get-module-names-for");
const { getMovieInfoAndCacheResults } = require("../../common/get-movie-data");
const { readJSON } = require("../../common/utils");

async function combine() {
  const cinemasPath = path.join(__dirname, "..", "..", "cinemas");
  const data = {};
  const cinemas = await getModuleNamesFor(cinemasPath);
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

    for (const { title, themoviedb } of movies) {
      if (themoviedb) {
        const outputTitle = title.slice(0, 35);
        const start = Date.now();
        process.stdout.write(
          ` - Retriving data for ${"".padEnd(7 - `${themoviedb.id}`.length, " ")}[${themoviedb.id}] ${outputTitle} ... ${"".padEnd(35 - outputTitle.length, " ")}`,
        );

        if (movieInfo[themoviedb.id]) {
          console.log(`\t🆓 Already retrieved`);
          continue;
        }

        try {
          try {
            movieInfo[themoviedb.id] =
              await getMovieInfoAndCacheResults(themoviedb);
          } catch {
            // Try again to get the data if it fails. The movie info will be
            // cached from the previous run if it was successful.
            process.stdout.write(`\\t🔄`);
            movieInfo[themoviedb.id] =
              await getMovieInfoAndCacheResults(themoviedb);
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
