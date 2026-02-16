const { parseISO } = require("date-fns");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  generateShowingId,
  isPrivateHire,
} = require("../../common/utils");
const standardizePrefixingForTheatrePerformances = require("../standardize-prefixing-for-theatre-performances");

const screenMapping = {
  117: "1", // regentstreetcinema.com
  131: "1", // sidcupstoryteller.co.uk
  132: "2", // sidcupstoryteller.co.uk
  133: "3", // sidcupstoryteller.co.uk
  140: "1", // actonecinema.co.uk
  141: "2", // actonecinema.co.uk
  301: "Lounge", // actonecinema.co.uk
  236: "1", // throwleyyardcinema.co.uk
  237: "2", // throwleyyardcinema.co.uk
  238: "3", // throwleyyardcinema.co.uk
  240: "4", // throwleyyardcinema.co.uk
  295: "Stage", // throwleyyardcinema.co.uk
  318: "1", // phoenixcinema.co.uk
  317: "2", // phoenixcinema.co.uk
  439: "1", // chiswickcinema.co.uk
  440: "2", // chiswickcinema.co.uk
  441: "3", // chiswickcinema.co.uk
  442: "4", // chiswickcinema.co.uk
  443: "5", // chiswickcinema.co.uk
};

const isCastPlaceholder = (value) =>
  value?.toLowerCase()?.startsWith("cast to be announced");

const isTheatreProduction = (title) =>
  standardizePrefixingForTheatrePerformances(title).startsWith(
    "The Metropolitan Opera:",
  );

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

    if (isPrivateHire(movie.name)) return moviesAtCinema;

    const transformedMovie = {
      showingId: generateShowingId(attributes, movie.id),
      title: movie.name,
      url: `${domain}/movie/${movie.urlSlug}`,
      overview: createOverview({
        categories: movie.allGenres,
        duration: movie.duration,
        directors: movie.directedBy,
        // Don't use the cast list if it's just placeholder test or the listing
        // page is for a theatre event (where the crew lists are often wrong).
        actors:
          isCastPlaceholder(movie.starring) || isTheatreProduction(movie.name)
            ? ""
            : movie.starring,
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
        if (
          tags.includes("no-trailers-or-adverts") ||
          tags.includes("ad-free")
        ) {
          notesList.push("No adverts or trailers");
        }
        if (tags.includes("intro")) {
          notesList.push("This screening features a specialist introduction");
        }
        if (tags.includes("qa")) {
          notesList.push(
            "This screening features a special in person Q&A appearance",
          );
        }
        if (tags.includes("dog-friendly")) {
          notesList.push("This screening is dog friendly");
        }

        const status = {
          soldOut: showing.seatsRemaining === 0,
        };

        const accessibility = createAccessibility(movie.name, {
          audioDescription: tags.includes("ad"),
          relaxed: tags.includes("relaxed") || tags.includes("ld-friendly"),
          babyFriendly:
            tags.includes("carers--babies") ||
            tags.includes("baby") ||
            tags.includes("kids-club") ||
            tags.includes("baby-friendly"),
          hardOfHearing:
            tags.includes("hard-of-hearing") ||
            tags.includes("hoh") ||
            tags.includes("cc") ||
            tags.includes("oc"),
          subtitled:
            tags.includes("subbed") ||
            tags.includes("subtitles") ||
            tags.includes("subtitled") ||
            tags.includes("oc"),
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

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
