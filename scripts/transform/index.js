const cheerio = require("cheerio");
const { isAfter } = require("date-fns");
const {
  sortAndFilterMovies,
  basicNormalize,
  getId,
  removeMatchingHints,
  isPrivateHire,
} = require("../../common/utils");
const findMatchesOnTheMovieDb = require("./find-matches-on-the-movie-db");
const getSourcedEventsFor = require("./get-sourced-events-for");
const validateAgainstSchema = require("./validate-against-schema");
const categoriseEntries = require("./categorise-entries");

async function transform(
  location,
  input,
  yesterdaysRelease = [],
  previousRelease = [],
) {
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

  console.log("Checking historical data ...");
  const checkFor =
    (movie) =>
    ({ showingId }) => {
      if (showingId === movie.showingId) return true;

      // Support miration of picturehouse IDs to remove venue ID section:
      // - from "picturehouses.com-finsbury-park-031-HO00015869"
      // - to   "picturehouses.com-finsbury-park-HO00015869"
      if (showingId.startsWith("picturehouses.com-")) {
        const migratedShowingId = showingId.replace(
          /^picturehouses.com-(.+)-\d{3}-HO(\d+)$/i,
          "picturehouses.com-$1-HO$2",
        );
        if (migratedShowingId === movie.showingId) return true;
      }

      return false;
    };

  try {
    const start = Date.now();

    let newSeen = 0;
    for (const movie of matchedData) {
      const previouslySeen = previousRelease.find(checkFor(movie));
      if (previouslySeen) {
        // If we've seen this movie before in a previous run, then copy across
        // the date is was first seen.
        movie.seen = previouslySeen.seen;
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

    // Only check for missing data for the following locations
    const optedIn = [
      "barbican.org.uk",
      "beermerchantstap.com",
      "bfi.org.uk-imax",
      "bfi.org.uk-southbank",
      // "chiswickcinema.co.uk", // Removed due to moving systems so old invalid URLs were being pulled in
      "cinemamuseum.org.uk",
      "closeupfilmcentre.com",
      "electriccinema.co.uk-portobello",
      "electriccinema.co.uk-white-city",
      "freud.org.uk",
      "genesiscinema.co.uk",
      "jw3.org.uk",
      "institut-francais.org.uk",
      "myvue.com-finchley-road",
      "myvue.com-fulham-broadway",
      "myvue.com-islington",
      "myvue.com-leicester-square",
      "myvue.com-north-finchley",
      "myvue.com-piccadilly",
      "myvue.com-shepherds-bush",
      "myvue.com-westfield",
      "myvue.com-westfield-stratford-city",
      "odeon.co.uk-acton",
      "odeon.co.uk-beckenham",
      "odeon.co.uk-camden",
      "odeon.co.uk-greenwich",
      "odeon.co.uk-haymarket",
      "odeon.co.uk-holloway",
      "odeon.co.uk-islington",
      "odeon.co.uk-kingston",
      "odeon.co.uk-lee-valley",
      "odeon.co.uk-leicester-square",
      "odeon.co.uk-putney",
      "odeon.co.uk-richmond",
      "odeon.co.uk-south-woodford",
      "odeon.co.uk-streatham",
      "odeon.co.uk-swiss-cottage",
      "odeon.co.uk-tottenham-court-road",
      "odeon.co.uk-uxbridge",
      "odeon.co.uk-west-end",
      "odeon.co.uk-wimbledon",
      "olympiccinema.com",
      "princecharlescinema.com",
      "richmix.org.uk",
      "riversidestudios.co.uk",
      "thearzner.com",
      "thecastlecinema.com",
      "thecinemaatselfridges.com",
      "thecinemainthepowerstation.com",
      "thegardencinema.co.uk",
      "thelexicinema.co.uk",
      // "thenickel.co.uk", // A misparsed performance has been added so opt-out of checking for missing performances until it's cleared
    ];
    const yesterdaysData = optedIn.includes(location) ? yesterdaysRelease : [];

    // If a movie matches the following, it's been delisted but is still valid:
    for (const movie of yesterdaysData) {
      // Don't bring unbookable events back in
      if (isPrivateHire(movie.title)) continue;

      // The movie data from yesterday contains future performances .
      // If there's no future performances, it's a past movie; continue
      const now = new Date();
      const futurePerformances = movie.performances.filter(({ time }) =>
        isAfter(time, now),
      );
      if (futurePerformances.length === 0) continue;

      // The movie was in yesterdays data, identified by the showing ID.
      // If there's a match, we already have the data; continue
      const showingIdMatch = matchedData.find(
        ({ showingId }) => showingId === movie.showingId,
      );
      if (showingIdMatch) continue;

      // The movie was in yesterdays data, identified by the performances.
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
        content = await response.text();
      } catch {
        // If something goes wrong checking the the URL, assume it's been removed
        continue;
      }
      if (!response.ok || response.url.includes("/not-found")) continue;

      // Check response content in case the service is misconfigured to respond
      // ok status with not found content
      const pageNotFound = basicNormalize("page not found");
      if (basicNormalize(content).includes(pageNotFound)) continue;

      const noScreenings = basicNormalize("no screenings currently scheduled");
      if (basicNormalize(content).includes(noScreenings)) continue;

      const cancelledEvent = basicNormalize("cancelled event");
      if (basicNormalize(content).includes(cancelledEvent)) continue;

      const noPerformance = basicNormalize(
        "there are currently no performance scheduled for this event",
      );
      if (basicNormalize(content).includes(noPerformance)) continue;

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
      const $ = cheerio.load(content);
      const canonicalUrl = $('link[rel="canonical"]').attr("href");
      const canonicalMatch = matchedData.find(
        ({ url }) =>
          canonicalUrl && basicNormalize(url) === basicNormalize(canonicalUrl),
      );
      if (canonicalMatch) continue;

      // Otherwise, add the movie into the transformed data
      console.log(" - Found missing movie:", movie.title, movie.url);
      if (!movie.showingId) {
        // Generate showing id for historic data
        const prefix = movie.url.includes("eventbrite.co")
          ? "eventbrite.co.uk"
          : location;
        movie.showingId = `${prefix}-${getId(movie.url)}`;
      }
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

  matchedData = matchedData.map(removeMatchingHints);

  console.log("Validating data ...");
  try {
    const start = Date.now();
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
