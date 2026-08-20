const cheerio = require("cheerio");
const {
  sanitizeRichText,
  createPerformance,
  removeAlreadyListedPerformances,
  createOverview,
  createAccessibility,
  createFormat,
  basicNormalize,
  generateShowingId,
  isPrivateHire,
  getText,
} = require("../../common/utils");
const { extractPeopleNames } = require("../../common/extract-people");
const { parseDate } = require("./utils");

/**
 * Extract the description from application/ld+json on the movie page.
 * Savoy Systems pages typically include a ScreeningEvent or Event schema.
 */
function extractDescriptionFromLdJson(html) {
  if (!html) return null;

  const $ = cheerio.load(html);
  let description = null;

  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const data = JSON.parse(getText($(el)));
      // Look for description in the JSON-LD data
      if (data["@graph"][0].description) {
        description = data["@graph"][0].description.replaceAll("  ", "\n");
      }
    } catch {
      // Ignore JSON parse errors
    }
  });

  return description;
}

function getStatus(performance) {
  return { soldOut: basicNormalize(performance.IsSoldOut) === "y" };
}

/**
 * Lexi Cinema Tags
 * - BF  => Baby-Friendly Screenings
 * - FF  => Family Fun
 * - AD  => Audio Described
 * - HOH => Hard of Hearing
 * - RS  => Relaxed Screening
 * - QA  => Q+A
 * - AS  => Accessible Screenings
 * [Specific events -- these may change]
 * - BHS => Black History Studies
 * - TP  => Talking Pictures
 * - WA  => Women of Almodóvar
 * - SL  => Spotlight
 * - BR  => Summer Nights in Brazil
 */

/**
 * Rio Cinema Tags
 * - PP    => Pink Palace
 * - SP    => Special Event
 * - CM    => Classic Matinee
 * - QA    => Q+A / Discussion
 * - FF    => Family Flicks
 * - HoH   => Hard of Hearing
 * - RS    => Relaxed Screening
 * - CB    => Carers + Baby
 * - NoAds => No Ads or Trailers
 */

/**
 * Arzner Tags
 * - CC => Closed Captions
 */

function getAccessibility(performance, synopsis) {
  return {
    audioDescription: basicNormalize(performance.AD) === "y", // Lexi Cinema
    hardOfHearing:
      basicNormalize(performance.HOH) === "y" || // Lexi Cinema
      basicNormalize(performance.HoH) === "y" || // Rio Cinema
      basicNormalize(performance.CC) === "y", // Arzner
    babyFriendly:
      basicNormalize(performance.BF) === "y" || // Lexi Cinema
      basicNormalize(performance.FF) === "y" || // Lexi Cinema
      basicNormalize(performance.CB) === "y", // Rio Cinema
    relaxed: basicNormalize(performance.RS) === "y", // Lexi Cinema, Rio Cinema
    subtitled:
      basicNormalize(performance.HOH) === "y" || // Lexi Cinema
      basicNormalize(synopsis).includes("with english subtitles"),
  };
}

function getNotesList(performance) {
  const notes = [];
  if (basicNormalize(performance.QA) === "y") {
    // Lexi Cinema, Rio Cinema
    notes.push("This screening will be followed by a Q&A");
  }
  if (basicNormalize(performance.AS) === "y") {
    // Lexi Cinema
    notes.push("Accessible screening");
  }
  if (basicNormalize(performance.TP) === "y") {
    // Lexi Cinema
    notes.push(
      "Talking Pictures: A friendly film discussion group for seniors",
    );
  }
  if (basicNormalize(performance.SP) === "y") {
    // Rio Cinema
    notes.push("Special Event");
  }
  if (basicNormalize(performance.NoAds) === "y") {
    // Rio Cinema
    notes.push("No Ads or Trailers");
  }
  return notes;
}

function removeSuperfluousInformation(overview) {
  return (
    overview
      // Remove confusing dog-friendly screening specific text from description
      .replace(/Bring your furry divas[^\n]+\n/i, "")
  );
}

// Double-bill listings (e.g. Rio Cinema's "Category H" strand) give Director
// and Cast as two films' names joined with " + " - e.g. "Robin Hardy + Kōji
// Shiraishi". createOverview's list-splitting doesn't treat "+" as a
// separator, so left alone this collapses into one garbled name and the
// per-film crew hint that multi-movie matching relies on is lost. Normalise
// it to a comma, which is already a recognised separator.
const splitPlusJoinedNames = (value) => value?.replace(/\s+\+\s+/g, ", ");

async function transform(attributes, urlSlug, movieData, sourcedEvents) {
  const { movieListPage, moviePages } = movieData;

  // Remove private hire entries
  const listedEvents = movieListPage.Events.filter(
    ({ Title }) => !isPrivateHire(Title),
  );

  const movies = listedEvents.reduce((events, movie) => {
    const title = sanitizeRichText(movie.Title);

    // Get description from the movie page's ld+json if available
    const moviePageHtml = moviePages[movie.ID];
    const ldJsonDescription = extractDescriptionFromLdJson(moviePageHtml);
    // Use the ld+json description if available, otherwise fall back to the truncated Synopsis
    const overview = removeSuperfluousInformation(
      ldJsonDescription || movie.Synopsis,
    );

    return events.concat({
      showingId: generateShowingId(attributes, movie.ID),
      title,
      url: movie.URL,
      overview: createOverview({
        duration: movie.RunningTime,
        classification: movie.Rating.match(/bbfc\/lrg\/([^.]+)\./)?.[1],
        directors: splitPlusJoinedNames(movie.Director),
        actors: splitPlusJoinedNames(movie.Cast),
      }),
      performances: movie.Performances.map((performance) =>
        createPerformance({
          date: parseDate(performance),
          notesList: getNotesList(performance),
          url: performance.URL.toLowerCase().startsWith("http")
            ? performance.URL
            : `${attributes.domain}/${urlSlug}/${performance.URL}`,
          screen: performance.AuditoriumName,
          status: getStatus(performance),
          accessibility: createAccessibility(
            title,
            getAccessibility(performance, overview),
            overview,
          ),
          format: createFormat(title, {}, overview),
        }),
      ),
      matchingHints: {
        overview,
        characters: extractPeopleNames(overview),
        crew: extractPeopleNames(overview),
      },
    });
  }, []);

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );

  // A source covering a night here can link back to the venue's own Savoy
  // listing rather than to its own page - gel.now sends Doc'n Roll's HAKEEM to
  // the Rio's "?f=2652932". That's the film id the venue's showingId is built
  // from, so it names the very listing we already have.
  // removeAlreadyListedPerformances can't see it: the link sits on the venue's
  // own host, which it excludes because two screens can open at once there. A
  // film id has no such ambiguity - it names one listing, whichever screen it
  // plays on - so it needs no matching time to be sure. The listing it points
  // at is where we read that film's performances from, and it can only be
  // relaying one of them.
  const venueFilmIds = new Set(listedEvents.map(({ ID }) => `${ID}`));
  const relaysVenueListing = ({ bookingUrl }) => {
    let filmId;
    try {
      filmId = new URL(bookingUrl).searchParams.get("f");
    } catch {
      return false;
    }
    return !!filmId && venueFilmIds.has(filmId);
  };

  const unlistedEvents = removeAlreadyListedPerformances(
    movies,
    listOfSourcedEvents,
    { venueDomain: attributes.domain },
  ).map((event) => ({
    ...event,
    performances: event.performances.filter(
      (performance) => !relaysVenueListing(performance),
    ),
  }));

  return movies.concat(unlistedEvents);
}

module.exports = transform;
