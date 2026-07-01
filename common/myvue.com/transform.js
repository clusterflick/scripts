const { parseISO } = require("date-fns");
const {
  sanitizeRichText,
  createOverview,
  createPerformance,
  createAccessibility,
  generateShowingId,
} = require("../../common/utils");
const { isNotSportShowing } = require("../../common/is-sport-showing");

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
          notesList,
          url: `${domain}${showing.bookingUrl}`,
          accessibility: createAccessibility(
            movie.filmTitle,
            accessibility,
            movie.synopsisShort,
          ),
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

  // Put in a carve out for recently closed Shepherds Bush until it can be removed
  if (movies.length === 0 && attributes.id !== "myvue.com-shepherds-bush") {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );

  return movies.concat(listOfSourcedEvents).filter(isNotSportShowing);
}

module.exports = transform;
