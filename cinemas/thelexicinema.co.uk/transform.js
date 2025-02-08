const {
  sanitizeRichText,
  createPerformance,
  createOverview,
  createAccessibility,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const { domain } = require("./attributes");

function getStatus(performance) {
  return { soldOut: performance.IsSoldOut.toLowerCase() === "y" };
}

function getAccessibility(performance) {
  return {
    audioDescription: performance.AD.toLowerCase() === "y",
    hardOfHearing: performance.HOH.toLowerCase() === "y",
    babyFriendly: performance.BF.toLowerCase() === "y",
    relaxed: performance.RS.toLowerCase() === "y",
  };
}

function getNotesList(performance) {
  const notes = [];
  // Q+A
  if (performance.QA.toLowerCase() === "y") {
    notes.push("This screening will be followed by a Q&A");
  }
  // Accessible screening
  if (performance.AS.toLowerCase() === "y") {
    notes.push("Accessible screening");
  }
  // Talking Pictures
  if (performance.TP.toLowerCase() === "y") {
    notes.push(
      "Talking Pictures: A friendly film discussion group for seniors",
    );
  }
  return notes;
}

async function transform(movieData, sourcedEvents) {
  const movies = movieData.Events.map((movie) => {
    return {
      title: sanitizeRichText(movie.Title),
      url: movie.URL,
      overview: createOverview({
        duration: movie.RunningTime,
        classification: movie.Rating.match(/bbfc\/lrg\/([^.]+)\./)[1],
        directors: movie.Director,
        actors: movie.Cast,
      }),
      performances: movie.Performances.map((performance) =>
        createPerformance({
          date: parseDate(performance),
          notesList: getNotesList(performance),
          url: `${domain}/TheLexiCinema.dll/${performance.URL}`,
          screen: performance.AuditoriumName,
          status: getStatus(performance),
          accessibility: createAccessibility(getAccessibility(performance)),
        }),
      ),
    };
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
