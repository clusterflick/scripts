const path = require("node:path");
const { readJSON } = require("../../common/utils");
const { getMovieInfoAndCacheResults } = require("../../common/get-movie-data");
const { buildMovieData } = require("../combine/build-movie-data");
const { indexUnmatchedByTitle } = require("./find-still-listed");

/**
 * Build the bundle of movies that have stopped screening.
 *
 * A movie drops out of the transformed data the moment its last performance
 * has been and gone, which used to take its page with it - every link to it,
 * indexed or shared, started returning a 404. This bundle keeps enough to go
 * on rendering those pages for as long as the seen registry remembers them.
 *
 * Departure is decided by subtraction: anything in the registry that is not in
 * the combined data has gone. The registry's own `lastSeen` is not consulted
 * for this, so a run that published nothing cannot make the whole catalogue
 * look departed.
 *
 * The bundle is self-contained - it carries the people and genres its movies
 * reference - and is written beside the combined data rather than into it.
 * Nothing that reads `combined-data.json` sees any of this, which is the point:
 * these movies must not reach the client payload, appear in listings, or be
 * sent to the match stage.
 *
 * @returns {Promise<object>} The departed-movies bundle
 */
async function departed() {
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
    // Expected only until the first registry is published. Failing here would
    // block the combined release for something the site treats as optional.
    console.log("⚠️ No seen registry found; no departed movies to build");
    return emptyBundle();
  }

  const combinedPath = path.join(
    process.cwd(),
    "combined-data",
    "combined-data.json",
  );
  const combined = await readJSON(combinedPath);
  const showing = new Set(Object.keys(combined.movies));

  const departedIds = Object.keys(registry.movies ?? {}).filter(
    (id) => !showing.has(id),
  );

  if (departedIds.length === 0) {
    console.log("➡️  No departed movies in the registry");
    return emptyBundle();
  }

  let cache = {};
  try {
    cache = await readJSON(
      path.join(process.cwd(), "cached-data", "moviedb-data.json"),
    );
  } catch {
    console.log("⚠️ Unable to load cached data");
  }

  // Deliberately scratch: buildMovieData registers people and genres into
  // whatever it is handed, and these must not end up in the combined blob.
  const siteData = { people: {}, genres: {} };
  const { default: slugify } = await import("@sindresorhus/slugify");
  // No resolveCollectionId: collections are the only part of the mapping that
  // reaches the network, and a departed movie is not listed on its collection's
  // page, so the id would dangle.
  const buildContext = { slugify, siteData };

  const stillListed = indexUnmatchedByTitle(combined.movies);

  const movies = {};
  let fetched = 0;
  let recovered = 0;

  for (const id of departedIds) {
    let movieInfo = cache[id];
    if (!movieInfo) {
      // The cache stage covers the registry, so a miss means a movie departed
      // after the last cache run. One live lookup is cheaper than waiting a day
      // for the page to appear.
      try {
        movieInfo = await getMovieInfoAndCacheResults({ id: Number(id) });
        fetched++;
      } catch {
        console.log(` - Warning: No movie data available for ${id}, skipping`);
        continue;
      }
    }

    const movie = {
      ...(await buildMovieData(movieInfo, buildContext)),
      ...registry.movies[id],
    };

    // An unmatched listing under the same title almost certainly *is* this
    // film, having lost its match rather than its screenings.
    const listing = stillListed.get(movie.normalizedTitle);
    if (listing) {
      movie.stillListedAs = listing;
      recovered++;
    }

    movies[id] = movie;
  }

  console.log(
    `➡️  Built ${Object.keys(movies).length} departed movies (${fetched} fetched live, ${recovered} still listed unmatched)`,
  );

  return {
    metadata: {
      registryRelease: registry.metadata?.release,
      movieCount: Object.keys(movies).length,
    },
    movies,
    people: siteData.people,
    genres: siteData.genres,
  };
}

const emptyBundle = () => ({
  metadata: { movieCount: 0 },
  movies: {},
  people: {},
  genres: {},
});

module.exports = departed;
