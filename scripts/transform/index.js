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

  console.log("Checking for missing data ...");
  try {
    const start = Date.now();

    // Don't check for missing data for the following locations
    const optedOut = [
      // For cineworld, we've no way of determining if the movie is missing or
      // deleted, so don't try.
      "cineworld.co.uk-bexleyheath",
      "cineworld.co.uk-enfield",
      "cineworld.co.uk-feltham",
      "cineworld.co.uk-hounslow",
      "cineworld.co.uk-ilford",
      "cineworld.co.uk-leicester-square",
      "cineworld.co.uk-south-ruislip",
      "cineworld.co.uk-the-o2-greenwich",
      "cineworld.co.uk-wandsworth",
      "cineworld.co.uk-wembley",
      "cineworld.co.uk-west-india-quay",
      "cineworld.co.uk-wood-green",
    ];
    const yesterdaysData = optedOut.includes(location) ? [] : historicData;

    // If a movie matches the following, it's been delisted but is still valid:
    for (const movie of yesterdaysData) {
      // The movie data from yesterday contains future performances .
      // If there's no future performances, it's a past movie; continue
      const now = new Date();
      const futurePerformances = movie.performances.filter(({ time }) =>
        isAfter(time, now),
      );
      if (futurePerformances.length === 0) continue;

      // The movie was in yesterdays data but is missing from todays data.
      // If there's a match, we already have the data; continue
      const match = matchedData.find(({ url, performances }) => {
        if (basicNormalize(url) === basicNormalize(movie.url)) {
          return true;
        }
        return futurePerformances.every(
          (performance) =>
            !!performances.find(
              ({ bookingUrl }) =>
                basicNormalize(bookingUrl) ===
                basicNormalize(performance.bookingUrl),
            ),
        );
      });
      if (match) continue;

      // The movie listing page is still up advertising the movie.
      // If we can't get the page or the page has a "not found" URL, then it's
      // been removed; continue
      let response;
      try {
        response = await fetch(movie.url);
      } catch {
        // If something goes wrong checking the the URL, assume it's been removed
        continue;
      }
      if (!response.ok || response.url.includes("/not-found")) continue;

      // Otherwise, add the movie into the transformed data
      console.log(" - Found missing movie:", movie.title, movie.url);
      matchedData.push(movie);
    }
    const duration = Math.round((Date.now() - start) / 1000);
    console.log(
      ` - ✅ ${optedOut.includes(location) ? "Skipped" : "Checked"} (${duration}s)`,
    );
  } catch (e) {
    console.log(` - ❌ Error checking`);
    throw e;
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
