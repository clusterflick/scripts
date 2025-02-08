const { parseISO } = require("date-fns");
const {
  sanitizeRichText,
  createOverview,
  createPerformance,
  createAccessibility,
} = require("../../common/utils");

async function transform(
  { domain, url },
  { result: movieData },
  sourcedEvents,
) {
  const movies = movieData.reduce((moviesAtCinema, movie) => {
    if (movie.showingGroups.length === 0) return moviesAtCinema;

    const overview = createOverview({
      categories: movie.genres,
      directors: movie.director,
      actors: movie.cast,
      duration: movie.runningTime,
      classification: movie.certificate?.name,
    });

    const performances = movie.showingGroups.flatMap(({ sessions }) =>
      sessions.map((showing) => {
        const accessibility = {};
        const notesList = [];

        (showing.attributes || []).forEach(
          ({ shortName: title, description, value }) => {
            if (value.toLowerCase() === "open-captioned") {
              accessibility.hardOfHearing = true;
              return;
            }
            if (value.toLowerCase() === "audio") {
              accessibility.audioDescription = true;
              return;
            }
            if (value.toLowerCase() === "big-shorts") {
              accessibility.audioDescription = true;
              // Don't return so it's added to the notes
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
          accessibility: createAccessibility(accessibility),
          status,
        });
      }),
    );

    const transformedMovie = {
      title: movie.filmTitle,
      url: movie.filmUrl.replace(domain, url),
      overview,
      performances,
    };
    return moviesAtCinema.concat(transformedMovie);
  }, []);

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );

  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
