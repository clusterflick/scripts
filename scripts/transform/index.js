const { isAfter } = require("date-fns");
const { sortAndFilterMovies, basicNormalize } = require("../../common/utils");
const findMatchesOnTheMovieDb = require("./find-matches-on-the-movie-db");
const getSourcedEventsFor = require("./get-sourced-events-for");
const validateAgainstSchema = require("./validate-against-schema");

async function transform(location, input, historicData) {
  const { transform, attributes } = require(`../../cinemas/${location}`);
  const sourcedEvents = await getSourcedEventsFor(attributes);

  console.log(`[🎞️  Location: ${location}]`);

  console.log("Transforming data ...");
  let transformedData;
  try {
    const start = Date.now();
    transformedData = sortAndFilterMovies(
      await transform(input, sourcedEvents ?? {}),
    );
    const duration = Math.round((Date.now() - start) / 1000);
    console.log(` - ✅ Transformed (${duration}s)`);
  } catch (e) {
    console.log(` - ❌ Error transforming`);
    throw e;
  }

  console.log("Matching data ...");
  let matchedData;
  try {
    const start = Date.now();
    matchedData = await findMatchesOnTheMovieDb(transformedData);
    const matches = matchedData.filter(({ themoviedb }) => !!themoviedb).length;
    const total = matchedData.length;
    const duration = Math.round((Date.now() - start) / 1000);
    console.log(` - ✅ Matched (${matches}/${total} in ${duration}s)`);
  } catch (e) {
    console.log(` - ❌ Error matching`);
    throw e;
  }

  // If a movie matches the following, it's been delisted but is still valid:
  for (const movie of historicData) {
    // The movie was in yesterdays data but is missing from todays data.
    // If there's a match, we already have the data; continue
    const match = matchedData.find(
      ({ url }) => basicNormalize(url) === basicNormalize(movie.url),
    );
    if (match) continue;

    // The movie data from yesterday contains future performances .
    // If there's no future performances, it's a past movie; continue
    const now = new Date();
    const futurePerformances = movie.performances.filter(({ time }) =>
      isAfter(time, now),
    );
    if (futurePerformances.length === 0) continue;

    // The movie listing page is still up advertising the movie.
    // If we can't get the page or the page has a "not found" URL, then it's
    // been removed; continue
    const response = await fetch(movie.url);
    if (!response.ok || response.url.includes("/not-found")) continue;

    // Otherwise, add the movie into the transformed data
    console.log(" - Found missing movie:", movie.title, movie.url);
    matchedData.push(movie);
  }

  console.log("Validating data ...");
  try {
    const start = Date.now();
    await validateAgainstSchema(matchedData);
    const duration = Math.round((Date.now() - start) / 1000);
    console.log(` - ✅ Validated (${duration}s)`);
  } catch (e) {
    console.log(` - ❌ Error matching`);
    console.log(e.cause);
    throw e;
  }

  return matchedData;
}

module.exports = transform;
