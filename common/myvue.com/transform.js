const { parseISO } = require("date-fns");
const {
  sanitizeRichText,
  createOverview,
  createPerformance,
  stripNoteLabels,
  createAccessibility,
  createFormat,
  getValidFormat,
  generateShowingId,
} = require("../../common/utils");
const { isNotSportShowing } = require("../../common/is-sport-showing");
const { getExpectedClosure } = require("../../common/expected-closures");

// Vue appends a generic description to every tag. For these labels the
// description just restates the label, so keep the label alone; "Event" is
// generic on both sides, so drop it entirely.
const noteLabels = {
  strip: [
    "Ultra Lux and Lux",
    "Laser",
    "Dolby Atmos",
    "HDR by Barco",
    "Biggest Screen",
    "Hindi",
    "Malayalam",
    "Punjabi",
    "Nepali",
    "Sing-Along",
    "Big Screen Events - Theatre",
    "Big Screen Events - Music",
    "Big Screen Events - Dance",
    "Big Screen Events - Opera",
  ],
  drop: ["Event"],
};

async function transform(attributes, { result: movieData }, sourcedEvents) {
  const { domain, url } = attributes;
  const movies = movieData.reduce((moviesAtCinema, movie) => {
    if (movie.showingGroups.length === 0) return moviesAtCinema;

    const overview = createOverview({
      categories: movie.genres,
      directors: movie.director,
      // Vue cannot be trusted to put actual actor data in the cast section
      duration: movie.runningTime,
      classification: movie.certificate?.name,
    });

    const performances = movie.showingGroups.flatMap(({ sessions }) =>
      sessions.map((showing) => {
        const accessibility = {};
        const format = {};
        const notesList = [];

        (showing.attributes || []).forEach(
          ({ shortName: title, description, value, shortName }) => {
            if (value.toLowerCase() === "open-captioned") {
              accessibility.subtitled = true;
              accessibility.hardOfHearing = true;
              return;
            }
            if (value.toLowerCase() === "audio") {
              accessibility.audioDescription = true;
              return;
            }
            // autism friendly
            if (value.toLowerCase() === "atf") {
              accessibility.relaxed = true;
              return;
            }
            if (
              value.toLowerCase() === "subtitled" ||
              shortName.toLowerCase() === "subtitled"
            ) {
              accessibility.subtitled = true;
              return;
            }
            if (
              value.toLowerCase() === "big-shorts" ||
              value.toLowerCase() === "mighty-mornings"
            ) {
              accessibility.babyFriendly = true;
              return;
            }
            // Screen format (IMAX, ...) is captured as structured format.
            const attributeFormat = {
              ...getValidFormat(value),
              ...getValidFormat(shortName),
            };
            if (Object.keys(attributeFormat).length > 0) {
              Object.assign(format, attributeFormat);
              return;
            }
            if (title && description) {
              notesList.push(`${title}: ${sanitizeRichText(description)}`);
            }
          },
        );

        const status = {
          soldOut: showing.isSoldOut,
        };

        return createPerformance({
          date: parseISO(showing.showTimeWithTimeZone),
          screen: showing.screenName,
          notesList: stripNoteLabels(notesList, noteLabels),
          url: `${domain}${showing.bookingUrl}`,
          accessibility: createAccessibility(
            movie.filmTitle,
            accessibility,
            movie.synopsisShort,
          ),
          format: createFormat(movie.filmTitle, format, movie.synopsisShort),
          status,
        });
      }),
    );

    const transformedMovie = {
      showingId: generateShowingId(attributes, movie.filmId),
      title: movie.filmTitle,
      url: movie.filmUrl.replace(domain, url),
      overview,
      performances,
      matchingHints: { overview: movie.synopsisShort },
    };
    return moviesAtCinema.concat(transformedMovie);
  }, []);

  if (movies.length === 0) {
    // A venue we know is shut has nothing to list, and the API says so with the
    // same empty response a broken scrape would give. Stand down only for a
    // declared closure, and say which one, so the empty output is explained in
    // the log rather than silent.
    const closure = getExpectedClosure(attributes.id);
    if (!closure) {
      throw new Error("No movies found - the page structure may have changed");
    }
    console.log(
      `      - ⚠️  No listings for ${attributes.id} - closed until ${closure.until} for ${closure.reason}`,
    );
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );

  return movies.concat(listOfSourcedEvents).filter(isNotSportShowing);
}

module.exports = transform;
