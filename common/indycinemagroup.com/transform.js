const { parseISO } = require("date-fns");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  generateShowingId,
} = require("../../common/utils");

const screenMapping = {
  117: "1", // regentstreetcinema.com
  131: "1", // sidcupstoryteller.co.uk
  132: "2", // sidcupstoryteller.co.uk
  133: "3", // sidcupstoryteller.co.uk
  140: "1", // actonecinema.co.uk
  141: "2", // actonecinema.co.uk
  162: "1", // ealingproject.co.uk
  163: "2", // ealingproject.co.uk
  164: "3", // ealingproject.co.uk
  236: "1", // throwleyyardcinema.co.uk
  237: "2", // throwleyyardcinema.co.uk
  238: "3", // throwleyyardcinema.co.uk
  240: "4", // throwleyyardcinema.co.uk
  295: "Stage", // throwleyyardcinema.co.uk
  318: "1", // phoenixcinema.co.uk
  317: "2", // phoenixcinema.co.uk
};

const isCastPlaceholder = (value) =>
  value?.toLowerCase()?.startsWith("cast to be announced");

async function transform(
  attributes,
  {
    data: {
      movies: { data: moviesData },
    },
  },
  sourcedEvents,
) {
  const { domain } = attributes;
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
      showingId: generateShowingId(attributes, movie.id),
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
      matchingHints: { overview: movie.synopsis },
    };

    return moviesAtCinema.concat([transformedMovie]);
  }, []);

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
