const { parseISO } = require("date-fns");
const {
  createOverview,
  createPerformance,
  createAccessibility,
} = require("../../common/utils");

const screenMapping = {
  115: "1", // riocinema.org.uk
  116: "2", // riocinema.org.uk
  117: "1", // regentstreetcinema.com
  122: "Ludski Bar", // riocinema.org.uk
  318: "1", // phoenixcinema.co.uk
  317: "2", // phoenixcinema.co.uk
  140: "1", // actonecinema.co.uk
  141: "2", // actonecinema.co.uk
};

const isCastPlaceholder = (value) =>
  value?.toLowerCase()?.startsWith("cast to be announced");

async function transform(
  { domain },
  {
    data: {
      movies: { data: moviesData },
    },
  },
  sourcedEvents,
) {
  const movies = moviesData.reduce((moviesAtCinema, movie) => {
    // If there are duplicate showings at the same time, take the last. This
    // fixes the issue where an invalid showing has been left in and replaced.
    const showings = Object.values(
      movie.showings.reduce(
        (mapping, showing) => ({ ...mapping, [showing.time]: showing }),
        {},
      ),
    ).sort((a, b) => a > b);

    const transformedMovie = {
      title: movie.name,
      url: `${domain}/movie/${movie.urlSlug}`,
      overview: createOverview({
        categories: movie.allGenres,
        duration: movie.duration,
        directors: movie.directedBy,
        actors: isCastPlaceholder(movie.starring) ? "" : movie.starring,
        classification: movie.rating,
        trailer: movie.trailerYoutubeId
          ? `https://www.youtube.com/watch?v=${movie.trailerYoutubeId}`
          : undefined,
      }),
      performances: showings.map((showing) => {
        const metaData = JSON.parse(showing.displayMetaData);
        const tags = metaData.classes.split(" ").map((tag) => tag.trim());

        const notesList = [
          `${showing.seatsRemaining} of ${showing.seatsRemaining + showing.ticketsSold} seats remaining`,
        ];
        if (tags.includes("no-trailers-or-adverts")) {
          notesList.push("No adverts or trailers");
        }

        const status = {
          soldOut: showing.seatsRemaining === 0,
        };

        const accessibility = createAccessibility({
          audioDescription: tags.includes("ad"),
          relaxed: tags.includes("relaxed"),
          babyFriendly:
            tags.includes("carers--babies") || tags.includes("baby"),
          hardOfHearing:
            tags.includes("hard-of-hearing") ||
            tags.includes("hoh") ||
            tags.includes("cc") ||
            tags.includes("oc"),
          subtitled: tags.includes("subbed") || tags.includes("subtitles"),
        });

        return createPerformance({
          date: parseISO(showing.time),
          screen: screenMapping[showing.screenId] || showing.screenId,
          notesList,
          url: `${domain}/checkout/showing/${movie.urlSlug}/${showing.id}`,
          status,
          accessibility,
        });
      }),
    };

    return moviesAtCinema.concat([transformedMovie]);
  }, []);

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
