const path = require("node:path");
const {
  getMovieInfoAndCacheResults,
  getCollectionInfoAndCacheResults,
} = require("../../common/get-movie-data");
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
  const collectionInfo = {};

  // A movie's TMDB details name the collection it belongs to, but not the rest
  // of its membership - that needs a second lookup per collection.
  const cacheCollectionFor = async (movie) => {
    const collection = movie.belongs_to_collection;
    if (!collection || collectionInfo[collection.id]) return;

    try {
      collectionInfo[collection.id] = await getCollectionInfoAndCacheResults({
        id: collection.id,
      });
    } catch {
      // Try again to get the data if it fails. The collection info will be
      // cached from the previous run if it was successful.
      collectionInfo[collection.id] = await getCollectionInfoAndCacheResults({
        id: collection.id,
      });
    }
  };

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

          await cacheCollectionFor(movieInfo[tmdbEntry.id]);

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

  // Movies that have stopped screening still have pages on the site, built
  // from this cache by the departed stage. They are no longer in any venue's
  // data, so the seen registry is the only record that they exist.
  const registryPath = path.join(
    process.cwd(),
    "diffed-data",
    "seen-registry.json",
  );
  let registry;
  try {
    registry = await readJSON(registryPath);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    console.log("⚠️ No seen registry found; caching showing movies only");
  }

  const departedIds = Object.keys(registry?.movies ?? {}).filter(
    (id) => !movieInfo[id],
  );

  if (departedIds.length > 0) {
    console.log(`[🎞️  Departed movies: ${departedIds.length}]`);

    for (const id of departedIds) {
      const start = Date.now();
      process.stdout.write(
        ` - Retriving data for ${"".padEnd(7 - id.length, " ")}[${id}] ... `,
      );

      try {
        try {
          movieInfo[id] = await getMovieInfoAndCacheResults({ id: Number(id) });
        } catch {
          process.stdout.write(`\\t🔄`);
          movieInfo[id] = await getMovieInfoAndCacheResults({ id: Number(id) });
        }
        console.log(
          `\t✅ Retrieved (${Math.round((Date.now() - start) / 1000)}s)`,
        );
      } catch {
        // Unlike a showing movie, there is nothing downstream waiting on this
        // one: its page simply won't be rebuilt this run. A movie pulled from
        // TheMovieDB will fail here every run until it ages out of the
        // registry, and failing the job over that would stop the pipeline for
        // a film nobody can watch.
        console.log(`\t❌ Error retriving, skipping`);
      }
    }

    console.log(" ");
  }

  console.log(
    `➡️  Cached data for ${Object.keys(movieInfo).length} movies in ${Object.keys(collectionInfo).length} collections`,
  );
  return { movieInfo, collectionInfo };
}

module.exports = combine;
