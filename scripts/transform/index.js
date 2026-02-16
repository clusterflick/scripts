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

    // Only check for missing data for the following locations
    const optedIn = [
      "229.london",
      "acflondon.org",
      "actonecinema.co.uk",
      "allisjoysoho.com",
      "aplaceforchange.co.uk",
      "arthousecrouchend.co.uk",
      "artotel.com-battersea-power-station",
      "artotel.com-hoxton",
      "backyardcinema.co.uk",
      "barbican.org.uk",
      "bbk.ac.uk-central",
      "bbk.ac.uk-cinema",
      "beehiven17.com",
      "beermerchantstap.com",
      "better.org.uk-croydon-sports-arena",
      "bfi.org.uk-imax",
      "bfi.org.uk-southbank",
      "bfi.org.uk-stephen-street",
      "boathousebarkingstudios.com",
      "boxpark.co.uk-wembley",
      "bulgarihotels.com",
      "castlehaven.org.uk",
      "castlesidcup.com",
      "chcc.org.uk",
      "chiswickcinema.co.uk",
      "cine-real.com",
      "cinemamuseum.org.uk",
      /*
       * For cineworld, we've no way of determining if the movie is missing or deleted, so don't try.
       */
      // "cineworld.co.uk-bexleyheath",
      // "cineworld.co.uk-enfield",
      // "cineworld.co.uk-feltham",
      // "cineworld.co.uk-hounslow",
      // "cineworld.co.uk-ilford",
      // "cineworld.co.uk-leicester-square",
      // "cineworld.co.uk-south-ruislip",
      // "cineworld.co.uk-the-o2-greenwich",
      // "cineworld.co.uk-wandsworth",
      // "cineworld.co.uk-wembley",
      // "cineworld.co.uk-west-india-quay",
      // "cineworld.co.uk-wood-green",
      "claphamgrand.com",
      "closeupfilmcentre.com",
      "coldharbourblue.com",
      "courthouse-hotel.com-shoreditch",
      "courthouse-hotel.com-soho",
      "crick.ac.uk",
      "curzon.com-aldgate",
      "curzon.com-bloomsbury",
      "curzon.com-camden",
      "curzon.com-hoxton",
      "curzon.com-kingston",
      "curzon.com-mayfair",
      "curzon.com-richmond",
      "curzon.com-soho",
      "curzon.com-victoria",
      "curzon.com-wimbledon",
      "curzonseacontainers.com",
      "dalstonsuperstore.com",
      "davidleancinema.org.uk",
      "electriccinema.co.uk-portobello",
      "electriccinema.co.uk-white-city",
      "ethicalproperty.co.uk-the-green-house",
      "eventimapollo.com",
      "everymancinema.com-baker-street",
      "everymancinema.com-barnet",
      "everymancinema.com-belsize-park",
      "everymancinema.com-borough-yards",
      "everymancinema.com-brentford",
      "everymancinema.com-broadgate",
      "everymancinema.com-canary-wharf",
      "everymancinema.com-chelsea",
      "everymancinema.com-crystal-palace",
      "everymancinema.com-hampstead",
      "everymancinema.com-kings-cross",
      "everymancinema.com-maida-vale",
      "everymancinema.com-muswell-hill",
      "everymancinema.com-screen-on-the-green",
      "everymancinema.com-stratford-international",
      "everymancinema.com-the-whiteley",
      "exchangetwickenham.co.uk",
      "facebook.com-thehaggerston",
      "fellowshipinn.co.uk",
      "feministlibrary.co.uk",
      "firmdalehotels.com-charlotte-street",
      "firmdalehotels.com-covent-garden",
      "firmdalehotels.com-soho",
      "forestcinema.co.uk",
      "freud.org.uk",
      "frontlineclub.com",
      "fulhampier.com",
      "genesiscinema.co.uk",
      "goethe.de",
      "gold.ac.uk",
      "goodhotel.co-london",
      "goodshepherdstudios.com",
      "ica.art",
      "imperial.ac.uk",
      "institut-francais.org.uk",
      "irishculturalcentre.co.uk",
      "islington.gov.uk-black-cultural-centre",
      "islington.gov.uk-islington-museum",
      "ivyhousenunhead.com",
      "japanhouselondon.uk",
      "jw3.org.uk",
      "kcl.ac.uk-strand",
      "khccc.com",
      "kilntheatre.com",
      "langleyfilmbox.com",
      "lewisham.gov.uk-deptford-lounge",
      "lost.org",
      "lumiereromford.com",
      "lux.org.uk",
      "marriott.com-w-london",
      "mason-fifth.com-westbourne-park",
      "metrocinema.co.uk",
      "metrolandcultures.com",
      "mothclub.co.uk",
      "myheathway.com",
      "myvue.com-bromley",
      "myvue.com-croydon-grants",
      "myvue.com-croydon-purley-way",
      "myvue.com-dagenham",
      "myvue.com-eltham",
      "myvue.com-finchley-road",
      "myvue.com-fulham-broadway",
      "myvue.com-harrow",
      "myvue.com-islington",
      "myvue.com-leicester-square",
      "myvue.com-north-finchley",
      "myvue.com-piccadilly",
      "myvue.com-romford",
      "myvue.com-shepherds-bush",
      "myvue.com-westfield",
      "myvue.com-westfield-stratford-city",
      "myvue.com-wood-green",
      "newtownculture.org-womens-museum",
      "objetstrouves.co.uk",
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
      "odeon.co.uk-orpington",
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
      "omniplex.co.uk-sutton",
      "peckhamplex.london",
      "pelicanhouse.org",
      "phoenixcinema.co.uk",
      "picturehouses.com-central",
      "picturehouses.com-clapham",
      "picturehouses.com-crouch-end",
      "picturehouses.com-ealing",
      "picturehouses.com-east-dulwich",
      "picturehouses.com-finsbury-park",
      "picturehouses.com-greenwich",
      "picturehouses.com-hackney",
      "picturehouses.com-the-gate",
      "picturehouses.com-the-ritzy",
      "picturehouses.com-west-norwood",
      "piehousecoop.co.uk",
      "princecharlescinema.com",
      "princeofpeckham.co.uk",
      "professional.dolby.com-soho",
      "qmul.ac.uk-bloc",
      "rca.ac.uk",
      "regentstreetcinema.com",
      "reinstate.info",
      "richmix.org.uk",
      "riocinema.org.uk",
      "riversidestudios.co.uk",
      "rivoliballroom.com",
      "rocketvan.co.uk",
      "ronspeckham.com",
      "royalalberthall.com",
      "sandsfilms.co.uk",
      "scarlettmalone.com-subtitlecinema",
      "sciencemuseum.org.uk",
      "scrt.onl",
      "setspace.uk",
      "shaispace.com",
      "signaturebrew.co.uk-blackhorseroad",
      "siobhandavies.com",
      "sohoscreeningrooms.co.uk",
      "stmarys.ac.uk-the-1850",
      "stmchurch.co.uk",
      "strongroombar.com",
      "tate.org.uk-tate-britain",
      "tate.org.uk-tate-modern",
      "thamesmeadnow.org.uk-the-nest",
      "thearzner.com",
      "theatreship.co.uk",
      "thebathhouse.co",
      "thecastlecinema.com",
      "thecinemaatselfridges.com",
      "thecinemainthepowerstation.com",
      "thedivine.co.uk",
      "theexhibit.co.uk",
      "thegardencinema.co.uk",
      "thegreennunhead.org",
      "thehammondtheatre.co.uk",
      "thehenandchickenstheatrebar.co.uk",
      "thehorsehospital.com",
      "thelexicinema.co.uk",
      "thelondonarchives.org",
      "themayfairhotel.co.uk",
      "thenickel.co.uk",
      "thersa.org",
      "thethomaswallcentre.harleystreethypnosis.co.uk",
      "thewildsbarkingriverside.london",
      "thexchange.org.uk",
      "triangledeptford.org",
      "ucl.ac.uk-bentham-house",
      "ucl.ac.uk-ssees",
      "ucl.ac.uk-ucl-east-community-cinema",
      "uel.ac.uk-the-source",
      "uk.kef.com",
      "vaginamuseum.co.uk",
      "walthamforest.gov.uk",
      "william-the-fourth.com",
    ];
    const previousReleaseData = optedIn.includes(location)
      ? previousRelease
      : [];

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
