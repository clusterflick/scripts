const { parseISO } = require("date-fns");
const {
  createOverview,
  createPerformance,
  createAccessibility,
} = require("../../common/utils");

const getCertificate = (attributeIds) => {
  if (attributeIds.includes("u")) return "U";
  if (attributeIds.includes("pg")) return "PG";
  if (attributeIds.includes("12a")) return "12A";
  if (attributeIds.includes("15")) return "15";
  if (attributeIds.includes("18")) return "18";
  return undefined;
};

const getCategories = (attributeIds) => {
  const categories = [];
  if (attributeIds.includes("adventure")) categories.push("Adventure");
  if (attributeIds.includes("drama")) categories.push("Drama");
  if (attributeIds.includes("action")) categories.push("Action");
  if (attributeIds.includes("animation")) categories.push("Animation");
  if (attributeIds.includes("horror")) categories.push("Horror");
  if (attributeIds.includes("comedy")) categories.push("Comedy");
  return categories;
};

async function transform(venue, { movieListPage, moviePages }, sourcedEvents) {
  const movies = {};
  let events = [];

  movieListPage.forEach((dayData) => {
    events = events.concat(dayData.events);

    dayData.films.forEach((film) => {
      const additionalData = moviePages[film.id].filmDetails;

      const overview = createOverview({
        duration: film.length,
        categories: getCategories(film.attributeIds),
        directors: additionalData.directors,
        actors: additionalData.cast,
        trailer: film.videoLink,
        classification: getCertificate(film.attributeIds),
      });

      // Ignore placeholders for private screenings
      if (film.name.toUpperCase() === "THEATRE LET") return;

      movies[film.id] = {
        title: film.name,
        url: film.link,
        overview,
        performances: [],
      };
    });
  });

  events.forEach((event) => {
    const movie = movies[event.filmId];

    // If the movie isn't available, then we've omitted it previously
    if (!movie) return;

    const status = {
      soldOut: event.soldOut,
    };
    const accessibility = {};
    const notesList = [];
    event.attributeIds.forEach((attributeId) => {
      if (attributeId === "audio-described") {
        accessibility.audioDescription = true;
      }
      if (attributeId === "subbed") {
        accessibility.subtitled = true;
      }
      if (attributeId === "autism-friendly") {
        accessibility.relaxed = true;
      }
      if (attributeId === "movies-for-juniors") {
        accessibility.babyFriendly = true;
      }
      if (attributeId === "classicfilm") {
        notesList.push("This is a classic film");
      }
    });

    movie.performances = movie.performances.concat(
      createPerformance({
        date: parseISO(event.eventDateTime),
        screen: event.auditorium,
        notesList,
        url: event.bookingLink,
        status,
        accessibility: createAccessibility(accessibility),
      }),
    );
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return Object.values(movies).concat(listOfSourcedEvents);
}

module.exports = transform;
