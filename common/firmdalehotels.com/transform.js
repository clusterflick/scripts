const cheerio = require("cheerio");
const {
  getText,
  createOverview,
  createPerformance,
  generateShowingId,
  basicNormalize,
} = require("../../common/utils");
const { parseDate } = require("./utils");

async function transform(attributes, { movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);
  const $movies = $(".cmp-section-film-club-films .cmp-section-film-club-film");

  const movies = Array.from($movies).map((el) => {
    const $movie = $(el);
    const id = $movie.data("film-show-name-ind");
    const title = $movie.data("film-name");
    const $description = $movie.find(".cmp-section-film-club-film-description");
    $description.find("br").replaceWith("\n");
    const details = getText($description)
      .split("\n")
      .map((value) => value.trim())
      .filter((value) => !!value)
      .join("\n");

    const $showings = $movie
      .find(".cmp-section-film-club-film-showing")
      .filter(
        (i, el) =>
          $(el).data("hotel").toLowerCase() ===
          attributes.name.toLowerCase().replace("firmdale", "").trim(),
      );
    const performances = Array.from($showings).map((el) => {
      const dateString = basicNormalize(
        getText($(el).find(".cmp-section-film-club-film-showing-date")),
      );
      const date = parseDate(dateString);
      const url = $(el)
        .find(".cmp-section-film-club-film-showing-link a")
        .attr("href");
      return createPerformance({ url, date });
    });

    return {
      showingId: generateShowingId(attributes, id),
      title,
      url: `${attributes.url}#${encodeURIComponent(title)}`,
      overview: createOverview({
        actors: details.match(/\nStars\s+(.+?)\n/i)?.[1],
        classification: details.match(/\(Certification ([^)]+)\)/i)?.[1],
        trailer: $movie
          .find(".cmp-section-film-club-film-media")
          .data("youtube-id"),
      }),
      performances,
      matchingHints: { overview: details },
    };
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
