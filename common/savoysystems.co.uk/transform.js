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
  convertNamesTextToList,
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

// ---------------------------------------------------------------------------
// Performance tags
//
// Savoy gives each venue its own short codes and lets it choose what they mean,
// so the vocabulary is venue configuration rather than anything platform-wide.
// The codes genuinely collide: `RS` is a Relaxed Screening at the Lexi and the
// Rio but a Restoration at ActOne, and the Lexi's `HOH` is the Rio's `HoH`.
// Reading every venue's codes on every venue would therefore file ActOne's 4K
// restorations as relaxed screenings, so each venue passes only its own map and
// a code it does not list is simply not its code.
//
// The map is `{ accessibilityField: [codes], notes: { code: text } }`; a venue
// publishes the meanings as an "Event Key" on its own What's On page, which is
// the only authority for what a code means. Leave a code out rather than
// guessing at it - an unmapped code loses a detail, a wrong one states an
// untruth about access.
// ---------------------------------------------------------------------------

const isTagged = (performance, codes = []) =>
  codes.some((code) => basicNormalize(performance[code]) === "y");

function getAccessibility(performance, synopsis, tags) {
  return {
    audioDescription: isTagged(performance, tags.audioDescription),
    hardOfHearing: isTagged(performance, tags.hardOfHearing),
    babyFriendly: isTagged(performance, tags.babyFriendly),
    relaxed: isTagged(performance, tags.relaxed),
    subtitled:
      isTagged(performance, tags.subtitled) ||
      basicNormalize(synopsis).includes("with english subtitles"),
  };
}

function getNotesList(performance, notes = {}) {
  return Object.entries(notes)
    .filter(([code]) => basicNormalize(performance[code]) === "y")
    .map(([, note]) => note);
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
// Shiraishi" - on top of the usual multi-person joins (",", "and", "&", ...)
// createOverview already splits within each film's own credits. Left alone,
// the "+" boundary between the two films' credits collapses into one garbled
// name and the per-film crew hint that multi-movie matching relies on is
// lost, so split on it first and let the existing name-list handling run
// on each side.
const namesJoinedByPlus = (value) =>
  value ? value.split(" + ").flatMap(convertNamesTextToList) : value;

async function transform(attributes, config, movieData, sourcedEvents) {
  const { urlSlug, tags } = config;
  if (!tags) {
    throw new Error(
      `No performance tag map given for ${attributes.id} - a venue must declare its own codes`,
    );
  }

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
        directors: namesJoinedByPlus(movie.Director),
        actors: namesJoinedByPlus(movie.Cast),
      }),
      performances: movie.Performances.map((performance) =>
        createPerformance({
          date: parseDate(performance),
          notesList: getNotesList(performance, tags.notes),
          url: performance.URL.toLowerCase().startsWith("http")
            ? performance.URL
            : `${attributes.domain}/${urlSlug}/${performance.URL}`,
          screen: performance.AuditoriumName,
          status: getStatus(performance),
          accessibility: createAccessibility(
            title,
            getAccessibility(performance, overview, tags),
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
