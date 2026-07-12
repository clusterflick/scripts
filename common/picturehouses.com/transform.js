const cheerio = require("cheerio");
const slugify = require("slugify");
const {
  getText,
  createOverview,
  createPerformance,
  stripNoteLabels,
  createAccessibility,
  createFormat,
  getValidFormat,
  generateShowingId,
  isPrivateHire,
} = require("../utils");
const {
  extractPeopleNames,
  extractBracketedNames,
} = require("../extract-people");
const { isNotSportShowing } = require("../is-sport-showing");
const { parseDate } = require("./utils");

// Strand/marketing labels whose description is just blurb ("Screen Arts:
// Bringing world-class arts productions to the big screen") - keep the strand
// label alone. Info-bearing notes (Silver Screen, Toddler Time, ...) are left
// untouched.
const noteLabels = {
  strip: [
    "Laser Projection",
    "Screen Arts",
    "Picturehouse Docs",
    "Discover",
    "reDiscover",
    "Rephouse",
    "Preview",
    "Live via Satellite",
    "Q&A",
  ],
};

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

async function transform(
  attributes,
  { movieListPage: { movies: moviesData }, moviePages },
  sourcedEvents,
) {
  const { domain, cinemaId } = attributes;
  const movies = moviesData
    .reduce((moviesAtCinema, movie) => {
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
          const showingAttributes = showing.attributes || [];
          const hasAttribute = (value) =>
            !!showingAttributes.find(
              ({ attribute }) => attribute.toLowerCase() === value,
            );
          const isFormatAttribute = ({ attribute }) =>
            Object.keys(getValidFormat(attribute)).length > 0;

          const status = {
            soldOut: !!showing.SoldoutStatus,
          };

          const accessibility = createAccessibility(
            movie.Title,
            {
              audioDescription: hasAttribute("audio d"),
              relaxed: hasAttribute("relaxed"),
              babyFriendly:
                hasAttribute("watch baby") ||
                hasAttribute("toddler ti") ||
                hasAttribute("kids' club"),
              hardOfHearing: hasAttribute("hohsub"),
              subtitled: hasAttribute("sub cinema"),
            },
            synopsis,
          );

          // Format markers come from two places: source/presentation (35mm,
          // 70mm, IMAX) live in the attribute objects, while dimension (2D/3D)
          // lives in SessionAttributesNames. Collect both into structured format
          // instead of leaving them in notes.
          const format = [
            ...showingAttributes.map(({ attribute }) => attribute),
            ...(showing.SessionAttributesNames || []),
          ].reduce((acc, token) => ({ ...acc, ...getValidFormat(token) }), {});

          return createPerformance({
            date: parseDate(showing.Showtime),
            screen: showing.ScreenName,
            notesList: stripNoteLabels(
              showingAttributes
                .filter(
                  (attribute) =>
                    !["audio d", "relaxed", "hohsub", "sub cinema"].includes(
                      attribute.attribute.toLowerCase(),
                    ) && !isFormatAttribute(attribute),
                )
                .map(({ attribute_full: title, description }) =>
                  description ? `${title}: ${description}` : title,
                ),
              noteLabels,
            ),
            url: `https://web.picturehouses.com/order/showtimes/${cinemaId}-${showing.SessionId}/seats`,
            status,
            accessibility,
            format: createFormat(movie.Title, format, synopsis),
          });
        }),
        matchingHints: {
          overview: synopsis,
          characters: extractPeopleNames(synopsis),
          cast: extractBracketedNames(synopsis),
          year: details["release date"]?.match(/\s+(\d{4})$/i)?.[1],
        },
      };

      return moviesAtCinema.concat(transformedMovie);
    }, [])
    .filter(isNotSportShowing);

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
