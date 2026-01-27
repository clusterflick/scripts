const cheerio = require("cheerio");
const nlp = require("compromise");
const {
  sanitizeRichText,
  createPerformance,
  createOverview,
  createAccessibility,
  basicNormalize,
  generateShowingId,
  isPrivateHire,
  getText,
} = require("../../common/utils");
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
        description = data["@graph"][0].description;
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
    subtitled: basicNormalize(synopsis).includes("with english subtitles"),
  };
}

function getCharacters(synopsis) {
  const doc = nlp(synopsis);
  const people = doc.people().json();
  if (people.length === 0) return;

  return people.map(({ text }) => text);
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

async function transform(attributes, urlSlug, movieData, sourcedEvents) {
  const { movieListPage, moviePages } = movieData;

  const movies = movieListPage.Events.reduce((events, movie) => {
    // Remove private hire entries
    if (isPrivateHire(movie.Title)) return events;

    const title = sanitizeRichText(movie.Title);

    // Get description from the movie page's ld+json if available
    const moviePageHtml = moviePages[movie.ID];
    const ldJsonDescription = extractDescriptionFromLdJson(moviePageHtml);
    // Use the ld+json description if available, otherwise fall back to the truncated Synopsis
    const overview = ldJsonDescription || movie.Synopsis;

    return events.concat({
      showingId: generateShowingId(attributes, movie.ID),
      title,
      url: movie.URL,
      overview: createOverview({
        duration: movie.RunningTime,
        classification: movie.Rating.match(/bbfc\/lrg\/([^.]+)\./)?.[1],
        directors: movie.Director,
        actors: movie.Cast,
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
          ),
        }),
      ),
      matchingHints: {
        overview,
        characters: getCharacters(overview),
      },
    });
  }, []);

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
