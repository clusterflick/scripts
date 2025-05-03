const nlp = require("compromise");
const {
  sanitizeRichText,
  createPerformance,
  createOverview,
  createAccessibility,
  basicNormalize,
  generateShowingId,
} = require("../../common/utils");
const { parseDate } = require("./utils");

function getStatus(performance) {
  return { soldOut: basicNormalize(performance.IsSoldOut) === "y" };
}

function getAccessibility(performance) {
  return {
    audioDescription: basicNormalize(performance.AD) === "y",
    hardOfHearing: basicNormalize(performance.HOH) === "y",
    babyFriendly: basicNormalize(performance.BF) === "y",
    relaxed: basicNormalize(performance.RS) === "y",
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
  // Q+A
  if (basicNormalize(performance.QA) === "y") {
    notes.push("This screening will be followed by a Q&A");
  }
  // Accessible screening
  if (basicNormalize(performance.AS) === "y") {
    notes.push("Accessible screening");
  }
  // Talking Pictures
  if (basicNormalize(performance.TP) === "y") {
    notes.push(
      "Talking Pictures: A friendly film discussion group for seniors",
    );
  }
  return notes;
}

async function transform(attributes, urlSlug, movieData, sourcedEvents) {
  const movies = movieData.Events.reduce((events, movie) => {
    if (basicNormalize(movie.Title) === basicNormalize("Private Event")) {
      return events;
    }

    return events.concat({
      showingId: generateShowingId(attributes, movie.ID),
      title: sanitizeRichText(movie.Title),
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
          accessibility: createAccessibility(getAccessibility(performance)),
        }),
      ),
      matchingHints: {
        overview: movie.Synopsis,
        characters: getCharacters(movie.Synopsis),
      },
    });
  }, []);

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
