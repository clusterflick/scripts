const { parseISO } = require("date-fns");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  createOccasions,
  createFormat,
  getValidFormat,
  generateShowingId,
  isPrivateHire,
  sanitizeRichText,
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
  503: "Amani Auditorium", // ebonylifeplacelondon.com
};

// The showing tags each accessibility feature and occasion is read from.
const accessibilityTags = {
  audioDescription: ["ad"],
  relaxed: ["relaxed", "ld-friendly"],
  babyFriendly: ["carers--babies", "baby", "kids-club", "baby-friendly"],
  dogFriendly: ["dog-friendly"],
  hardOfHearing: ["hard-of-hearing", "hoh", "cc", "captions", "oc"],
  subtitled: ["subbed", "subtitles", "subtitled", "oc"],
};
const occasionTags = {
  intro: ["intro"],
  qAndA: ["qa"],
};
const noAdvertsTags = ["no-trailers-or-adverts", "ad-free"];

const hasAnyTag = (tags, wanted) => wanted.some((tag) => tags.includes(tag));
const readTags = (tags, tagsByKey) =>
  Object.fromEntries(
    Object.entries(tagsByKey).map(([key, wanted]) => [
      key,
      hasAnyTag(tags, wanted),
    ]),
  );

// Any badge a venue puts on a showing that isn't read above, or as a format,
// names what the showing is part of - "London Baltic Film Festival", "Subtitled
// Wednesdays", "Andrea's Film Club" - and goes in the notes, where festival and
// club matchers look. These are the exceptions: badges about the seat, the
// sound or the projection rather than the programme, that nothing reads.
const tagsNotForNotes = new Set([
  ...Object.values(accessibilityTags).flat(),
  ...Object.values(occasionTags).flat(),
  ...noAdvertsTags,
  "reserved-seating",
  "event-cinema",
  "51",
  "4k",
  "laser",
]);
const isProgrammeTag = (tag) =>
  !tagsNotForNotes.has(tag) && Object.keys(getValidFormat(tag)).length === 0;

// A showing's tags are its badges' names as class names: lowercased, anything
// but letters, digits, spaces and hyphens dropped, and spaces made hyphens -
// "Monday Classic Matinée" is "monday-classic-matine", "Q&A" is "qa".
const toBadgeClass = (badge) =>
  badge
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/ /g, "-");

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

    // The per-showing `displayMetaData.classes` is sometimes missing badges the
    // venue does record at the movie level (e.g. a subtitled restoration whose
    // showings aren't individually tagged). The movie-level `displayMetaData`
    // carries `every-showings-*` classes for badges that apply to ALL showings,
    // so pull those out and fold them into every showing's tags. We only use
    // `every-showings-*` (not `some-showings-*`) because we can't attribute a
    // "some" badge to specific showings.
    let everyShowingTags = [];
    // Only the movie carries the badges' display names; a showing has just
    // their class names, so map one back to the other.
    const badgeNames = {};
    try {
      const movieMetaData = JSON.parse(movie.displayMetaData ?? "{}");
      for (const badge of movieMetaData.someShowingsBadges ?? []) {
        badgeNames[toBadgeClass(badge)] = badge.trim();
      }
      everyShowingTags = (movieMetaData.classes ?? "")
        .split(" ")
        .filter((className) => className.startsWith("every-showings-"))
        .map((className) => className.replace("every-showings-", ""));
    } catch {
      // Movie-level metadata missing or unparseable - fall back to showing tags.
    }

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
        const tags = [
          ...metaData.classes.split(" ").map((tag) => tag.trim()),
          ...everyShowingTags,
        ];

        const notesList = [];
        if (hasAnyTag(tags, noAdvertsTags)) {
          notesList.push("No adverts or trailers");
        }
        // A tag with no badge named on the movie is left out: there's no name
        // to give it, only a class name (seen on a showing left over from a
        // past event).
        [...new Set(tags)]
          .filter((tag) => isProgrammeTag(tag) && badgeNames[tag])
          .forEach((tag) => notesList.push(badgeNames[tag]));

        const status = {
          soldOut: showing.seatsRemaining === 0,
        };

        // Screen format markers (35mm, 70mm, imax, ...) are among the tags.
        const format = tags.reduce(
          (acc, tag) => ({ ...acc, ...getValidFormat(tag) }),
          {},
        );

        const accessibility = createAccessibility(
          movie.name,
          readTags(tags, accessibilityTags),
          sanitizeRichText(movie.synopsis ?? ""),
        );

        const date = parseISO(showing.time);
        return createPerformance({
          date,
          screen: screenMapping[showing.screenId] || showing.screenId,
          notesList,
          url: `${domain}/checkout/showing/${movie.urlSlug}/${showing.id}`,
          status,
          accessibility,
          format: createFormat(
            movie.name,
            format,
            sanitizeRichText(movie.synopsis ?? ""),
          ),
          occasions: createOccasions(
            movie.name,
            readTags(tags, occasionTags),
            sanitizeRichText(movie.synopsis ?? ""),
            { date },
          ),
        });
      }),
      matchingHints: { overview: sanitizeRichText(movie.synopsis ?? "") },
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
