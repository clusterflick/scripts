const slugify = require("slugify");
const { parseISO } = require("date-fns");
const {
  createPerformance,
  createOverview,
  createAccessibility,
} = require("../../common/utils");

const findFor = (list, idMatch) => list.find(({ id }) => id === idMatch);

async function transform(
  { domain },
  showtimeDays,
  { getBookingUrl },
  sourcedEvents,
) {
  const movies = showtimeDays.reduce(
    (
      mapping,
      { relatedData: { sites, films, censorRatings, genres, castAndCrew } },
    ) =>
      films.reduce((mappedFilms, film) => {
        if (mappedFilms[film.id]) return mappedFilms;
        if (film.title.text.toLowerCase().startsWith("private hire ")) {
          return mappedFilms;
        }

        const findByRole = (role) => (group, member) => {
          if (!member.roles.includes(role)) return group;

          const match = findFor(castAndCrew, member.castAndCrewMemberId);
          if (!match) return group;

          const {
            name: { givenName, familyName },
          } = match;
          return group.concat(`${givenName.trim()} ${familyName.trim()}`);
        };

        const classification = findFor(censorRatings, film.censorRatingId)
          ?.classification?.text;

        const overview = createOverview({
          duration: film.runtimeInMinutes,
          categories: film.genreIds.map(
            (genreId) => findFor(genres, genreId).name.text,
          ),
          directors: film.castAndCrew.reduce(findByRole("Director"), []),
          actors: film.castAndCrew.reduce(findByRole("Actor"), []),
          classification,
          trailer: film.trailerUrl,
        });

        const slug = slugify(film.title.text, { strict: true }).toLowerCase();
        return {
          ...mappedFilms,
          [film.id]: {
            title: film.title.text,
            url: `${domain}/films/${slug}/${film.id}/?siteId=${sites[0].id}`,
            overview,
            performances: [],
          },
        };
      }, mapping),
    {},
  );

  showtimeDays.forEach(
    ({ showtimes, relatedData: { screens, attributes } }) => {
      showtimes.forEach((performance) => {
        const { screenId, schedule } = performance;
        const movie = movies[performance.filmId];

        // Bail if we've performances for a movie we've skipped previously
        // e.g. a private hire event
        if (!movie) return;

        const notesList = [];
        const accessibility = {};
        if (performance.requires3dGlasses) {
          notesList.push("Requires 3D glasses");
        }
        performance.attributeIds.forEach((attributeId) => {
          const attribute = findFor(attributes, attributeId);
          if (attribute) {
            if (attribute.name.text.toLowerCase().endsWith(" (sub)")) {
              accessibility.subtitled = true;
              return;
            }
            if (attribute.name.text.toLowerCase() === "audio described") {
              accessibility.audioDescription = true;
              return;
            }
            if (attribute.name.text.toLowerCase() === "closed captioned") {
              accessibility.hardOfHearing = true;
              return;
            }
            if (attribute.name.text.toLowerCase() === "relaxed") {
              accessibility.relaxed = true;
              return;
            }
            if (attribute.name.text.toLowerCase() === "baby club") {
              accessibility.babyFriendly = true;
              return;
            }

            // Anything not directly related to accessibility features can be
            // added into the performance notes
            if (!attribute.description?.text) {
              notesList.push(attribute.name.text);
            } else {
              notesList.push(
                `${attribute.name.text}: ${attribute.description.text}`,
              );
            }
          }
        });

        movie.performances = movie.performances.concat(
          createPerformance({
            date: parseISO(schedule.startsAt),
            screen: findFor(screens, screenId).name.text,
            notesList,
            url: getBookingUrl(performance),
            status: { soldOut: performance.isSoldOut },
            accessibility: createAccessibility(accessibility),
          }),
        );
      });
    },
  );

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );

  return Object.values(movies).concat(listOfSourcedEvents);
}

module.exports = transform;
