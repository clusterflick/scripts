const cheerio = require("cheerio");
const { isAfter } = require("date-fns");
const {
  sortAndFilterMovies,
  basicNormalize,
  removeMatchingHints,
  isPrivateHire,
} = require("../../common/utils");
const { getCinema } = require("../../cinemas");
const findMatchesOnTheMovieDb = require("./find-matches-on-the-movie-db");
const getSourcedEventsFor = require("./get-sourced-events-for");
const validateAgainstSchema = require("./validate-against-schema");
const categoriseEntries = require("./categorise-entries");
const matchIdentifiedMovies = require("./match-identified-movies");
const identifyMultipleMovies = require("./identify-multiple-movies");
const identifyShorts = require("./identify-shorts");

async function transform(
  location,
  input,
  previousRelease = [],
  historicalSeen = new Map(),
) {
  const { transform, attributes } = getCinema(location);
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

  console.log("Checking historical data ...");
  try {
    const start = Date.now();

    let newSeen = 0;
    for (const movie of matchedData) {
      const previouslySeen = historicalSeen.get(movie.showingId);
      if (previouslySeen) {
        // If we've seen this movie before in a previous run (within the last
        // 10 days of combined data), copy across the date it was first seen.
        movie.seen = previouslySeen;
      } else {
        // If we've not seen this movie before in a previous run, then add the
        // current date as this is the first time we've seen it.
        movie.seen = Date.now();
        newSeen++;
      }
    }

    if (newSeen > 0) {
      console.log(` - Found ${newSeen} new movie${newSeen === 1 ? "" : "s"}`);
    }

    // Skip missing-data recovery for venues where we can't reliably
    // distinguish a genuinely removed listing from a stale one.
    const optedOut = [
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
      // Sports screenings can sneak in and then will be readded here. Given how
      // few actual screenings come from boxpark, skip this recovery flow
      "boxpark.co.uk-wembley",
      "fulhampier.com",
      // Temporarily remove jw3 which. has updates its system
      "jw3.org.uk",
    ];
    const previousReleaseData = optedOut.includes(location)
      ? []
      : previousRelease;

    // If a movie matches the following, it's been delisted but is still valid:
    for (const movie of previousReleaseData) {
      // Don't bring unbookable events back in
      if (isPrivateHire(movie.title)) continue;

      // The movie data from the previous release contains future performances.
      // If there's no future performances, it's a past movie; continue
      const now = new Date();
      const futurePerformances = movie.performances.filter(({ time }) =>
        isAfter(time, now),
      );
      if (futurePerformances.length === 0) continue;

      // The movie was in the previous data, identified by the showing ID.
      // If there's a match, we already have the data; continue
      const showingIdMatch = matchedData.find(
        ({ showingId }) => showingId === movie.showingId,
      );
      if (showingIdMatch) continue;

      // The movie was in the previous data, identified by the performances.
      // If there's a match, we already have the data; continue
      const performancesMatch = matchedData.find(({ url, performances }) => {
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
      if (performancesMatch) continue;

      // The movie listing page is still up advertising the movie.
      // If we can't get the page or the page has a "not found" URL, then it's
      // been removed; continue
      let response;
      let content;
      try {
        response = await fetch(movie.url);
        content = (await response.text()).replaceAll("&nbsp;", " ");
      } catch {
        // If something goes wrong checking the URL, assume it's been removed
        continue;
      }
      if (!response.ok || response.url.includes("/not-found")) continue;

      // Parse the HTML and extract visible text (excluding scripts and
      // styles) for content checks. Raw HTML can contain UI strings inside
      // inlined data (e.g. client-side rendered SPAs) that cause false matches.
      const $ = cheerio.load(content);
      $("script, style").remove();
      const visibleText = basicNormalize($.text());

      // Check response content in case the service is misconfigured to respond
      // ok status with not found content
      const removedPhrases = [
        "page not found",
        "no screenings currently scheduled",
        "cancelled event",
        "there are currently no performance scheduled for this event",
      ];
      if (removedPhrases.some((p) => visibleText.includes(basicNormalize(p)))) {
        continue;
      }

      // The movie may have been renamed, which would cause the title and URL to
      // change. Usually the old URL will redirect to the new URL, so let's
      // check if we can get a match with the new URL.
      // If there's a match, we already have the data; continue
      const redirectMatch = matchedData.find(
        ({ url }) => basicNormalize(url) === basicNormalize(response.url),
      );
      if (redirectMatch) continue;

      // The movie may have been renamed, which would cause the title and URL to
      // change. If the old URL doesn't redirect to the new URL, it may have an
      // updated canonical URL in the meta data pointing to the new location.
      // If there's a match, we already have the data; continue
      const canonicalUrl = $('link[rel="canonical"]').attr("href");
      const canonicalMatch = matchedData.find(
        ({ url }) =>
          canonicalUrl && basicNormalize(url) === basicNormalize(canonicalUrl),
      );
      if (canonicalMatch) continue;

      // Otherwise, add the movie into the transformed data
      console.log(" - Found missing movie:", movie.title, movie.url);
      matchedData.push(movie);
    }
    // Reprocess the matched data in case missed events have been added
    matchedData = sortAndFilterMovies(matchedData);

    const duration = Math.round((Date.now() - start) / 1000);
    console.log(` - ✅ Done (${duration}s)`);
  } catch (e) {
    console.log(` - ❌ Error checking`);
    throw e;
  }

  console.log("Categorising data ...");
  try {
    const start = Date.now();
    matchedData = await categoriseEntries(matchedData);
    const duration = Math.round((Date.now() - start) / 1000);
    console.log(` - ✅ Categorised (${duration}s)`);
  } catch (e) {
    console.log(` - ❌ Error categorising`);
    throw e;
  }

  console.log("Processing multiple-movies events ...");
  try {
    const start = Date.now();
    const multiMovieEvents = matchedData.filter(
      (m) => m.category === "multiple-movies" && m.matchingHints,
    );

    for (const movie of multiMovieEvents) {
      const matches = await matchIdentifiedMovies(
        movie,
        identifyMultipleMovies,
      );
      if (matches.length > 0) {
        movie.themoviedbs = matches;
      }
    }

    const duration = Math.round((Date.now() - start) / 1000);
    console.log(
      ` - ✅ Processed ${multiMovieEvents.length} multi-movie events (${duration}s)`,
    );
  } catch (e) {
    console.log(` - ❌ Error processing multiple-movies`);
    throw e;
  }

  console.log("Processing shorts events ...");
  try {
    const start = Date.now();
    const shortsEvents = matchedData.filter(
      (m) => m.category === "shorts" && m.matchingHints,
    );

    for (const movie of shortsEvents) {
      const matches = await matchIdentifiedMovies(movie, identifyShorts);
      if (matches.length > 0) {
        movie.themoviedbs = matches;
      }
    }

    const duration = Math.round((Date.now() - start) / 1000);
    console.log(
      ` - ✅ Processed ${shortsEvents.length} shorts events (${duration}s)`,
    );
  } catch (e) {
    console.log(` - ❌ Error processing shorts`);
    throw e;
  }

  matchedData = matchedData.map(removeMatchingHints);

  console.log("Validating data ...");
  try {
    const start = Date.now();

    const invalidShowingIdSuffixes = ["-undefined", "-null", "-NaN"];
    const invalidShowingIdPrefixes = ["undefined-", "null-", "NaN-"];
    const invalidEntry = matchedData.find(({ showingId }) => {
      const s = String(showingId);
      return (
        invalidShowingIdSuffixes.some((suffix) => s.endsWith(suffix)) ||
        invalidShowingIdPrefixes.some((prefix) => s.startsWith(prefix))
      );
    });
    if (invalidEntry) {
      throw new Error(
        `Invalid showingId "${invalidEntry.showingId}" (must not start with ${invalidShowingIdPrefixes.join(", ")} or end with ${invalidShowingIdSuffixes.join(", ")})`,
      );
    }

    await validateAgainstSchema(matchedData);

    const addIdToSet = (set, { showingId }) => set.add(showingId);
    const ids = matchedData.reduce(addIdToSet, new Set());
    if (ids.size !== matchedData.length) throw new Error("Duplicate ID");

    const duration = Math.round((Date.now() - start) / 1000);
    console.log(` - ✅ Validated (${duration}s)`);
  } catch (e) {
    console.log(` - ❌ Error validating`);
    console.log(e.cause);
    throw e;
  }

  return matchedData;
}

module.exports = transform;
