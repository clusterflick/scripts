const cheerio = require("cheerio");
const nlp = require("compromise");
const slugify = require("slugify");
const {
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
  generateShowingId,
  isPrivateHire,
} = require("../utils");
const { parseDate } = require("./utils");

function getDetails(data) {
  const $ = cheerio.load(data);
  const details = {};
  $(".directorDiv .directorInner").each(function () {
    const key = getText($(this)).toLowerCase().replace(":", "").trim();
    details[key] = getText($(this).next());
  });
  return details;
}

function getSynopsis(data) {
  const $ = cheerio.load(data);
  return getText($(".synopsisDiv"));
}

function getCharacters(synopsis) {
  const doc = nlp(synopsis);
  const people = doc.people().json();
  if (people.length === 0) return;

  return people.map(({ text }) => text);
}

function getCast(synopsis) {
  const doc = nlp(synopsis);
  const people = doc.people().json();
  if (people.length === 0) return;

  return people.reduce((cast, { text }) => {
    const bracketedName = text.trim().match(/^[^(]+\s+\(([^)]+)\)/i);
    if (!bracketedName) return cast;
    return cast.concat(bracketedName[1].trim());
  }, []);
}

async function transform(
  attributes,
  { movieListPage: { movies: moviesData }, moviePages },
  sourcedEvents,
) {
  const { domain, cinemaId } = attributes;
  const movies = moviesData.reduce((moviesAtCinema, movie) => {
    const slug = slugify(movie.Title, { strict: true }).toLowerCase();
    const showings = movie.show_times.filter(
      (showing) => showing.CinemaId === cinemaId,
    );

    if (showings.length === 0) return moviesAtCinema;

    // Remove private hire entries
    if (isPrivateHire(movie.Title)) return moviesAtCinema;

    const moviePage = moviePages[movie.ScheduledFilmId];
    const id = movie.ScheduledFilmId.trim();
    const details = getDetails(moviePage);
    const overview = createOverview({
      duration: movie.RunTime,
      classification: movie.Rating,
      trailer: movie.TrailerUrl,
      directors: details.director,
      actors: details.starring,
    });

    const synopsis = getSynopsis(moviePage);

    const transformedMovie = {
      showingId: generateShowingId(attributes, id),
      title: movie.Title,
      url: `${domain}/movie-details/${cinemaId}/${id}/${slug}`,
      overview,
      performances: showings.map((showing) => {
        const hasAttribute = (value) =>
          !!(showing.attributes || []).find(
            ({ attribute }) => attribute.toLowerCase() === value,
          );

        const status = {
          soldOut: !!showing.SoldoutStatus,
        };

        const accessibility = createAccessibility({
          audioDescription: hasAttribute("audio d"),
          relaxed: hasAttribute("relaxed"),
          babyFriendly:
            hasAttribute("watch baby") ||
            hasAttribute("toddler ti") ||
            hasAttribute("kids' club"),
          hardOfHearing: hasAttribute("hohsub"),
          subtitled: hasAttribute("sub cinema"),
        });

        return createPerformance({
          date: parseDate(showing.Showtime),
          screen: showing.ScreenName,
          notesList: (showing.attributes || [])
            .filter(
              ({ attribute }) =>
                !["audio d", "relaxed", "hohsub", "sub cinema"].includes(
                  attribute.toLowerCase(),
                ),
            )
            .map(({ attribute_full: title, description }) =>
              description ? `${title}: ${description}` : title,
            ),
          url: `https://web.picturehouses.com/order/showtimes/${cinemaId}-${showing.SessionId}/seats`,
          status,
          accessibility,
        });
      }),
      matchingHints: {
        overview: synopsis,
        characters: synopsis ? getCharacters(synopsis) : undefined,
        cast: synopsis ? getCast(synopsis) : undefined,
        year: details["release date"]?.match(/\s+(\d{4})$/i)?.[1],
      },
    };

    return moviesAtCinema.concat(transformedMovie);
  }, []);

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
