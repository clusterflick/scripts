const {
  createOverview,
  createPerformance,
  generateShowingId,
  sanitizeRichText,
  isPrivateHire,
  createAccessibility,
} = require("../../common/utils");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

const getNames = (array = []) => array.map(({ name }) => name).filter(Boolean);

/**
 * Parse duration from format like "2h 15m" to minutes
 */
function parseDuration(durationStr) {
  if (!durationStr) return undefined;

  const hourMatch = durationStr.match(/(\d+)h/);
  const minMatch = durationStr.match(/(\d+)m/);

  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
  const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;

  return hours * 60 + minutes;
}

function parseDateTime(dateStr, timeStr) {
  return parse(`${dateStr} ${timeStr}`, "yyyy-MM-dd h:mma", new Date(), {
    locale: enGB,
  });
}

async function transform(attributes, { movieListPage }, sourcedEvents) {
  // Aggregate movies by movie_id across all days
  const moviesMap = new Map();
  const tags = new Set();

  for (const dayPage of movieListPage) {
    if (!dayPage.data?.movies) continue;

    for (const movie of dayPage.data.movies) {
      const movieId = movie.movie_id;

      // Skip if no show times
      if (!movie.show_times || movie.show_times.length === 0) continue;
      // Don't pull data for entries which aren't bookable films
      if (isPrivateHire(movie.movie_name)) continue;

      // Get or create movie entry
      if (!moviesMap.has(movieId)) {
        const categories = getNames(movie.genre);
        const directors = getNames(movie.directed_by);
        const actors = getNames(movie.cast);
        const classification = (movie.movie_certification_name ?? "")
          .replace(/[()]/g, "")
          .trim();

        moviesMap.set(movieId, {
          showingId: generateShowingId(attributes, movieId),
          title: movie.movie_name,
          url: `${attributes.domain}/movies/${movie.url_key}?location=${attributes.location}&locationKey=${attributes.locationId}`,
          overview: createOverview({
            duration: parseDuration(movie.duration),
            categories,
            directors,
            actors,
            classification,
            trailer: movie.trailer,
          }),
          performances: [],
          matchingHints: {
            overview: movie.synopsis
              ? sanitizeRichText(movie.synopsis)
                  .split("<a ")[0]
                  .split(/[\n|\r]/)
                  .map((value) => value.trim())
                  .filter((value) => !!value)
                  .join("\n")
              : undefined,
          },
        });
      }

      // Add performances for this movie
      const movieEntry = moviesMap.get(movieId);
      for (const showTime of movie.show_times) {
        const notesList = [];
        const accessibility = {};

        // Add language if specified
        if (showTime.movie_language?.name) {
          notesList.push(showTime.movie_language.name);
        }

        showTime.show_times_tags.forEach((tag) => {
          tags.add(tag.name);
          if (tag.name.toLowerCase().includes("hoh")) {
            accessibility.hardOfHearing = true;
            return; // this doesn't need added to the notes
          }
          if (tag.name.toLowerCase().includes("parent and baby")) {
            accessibility.babyFriendly = true;
            return; // this doesn't need added to the notes
          }
          if (tag.name.toLowerCase().includes("relaxed")) {
            accessibility.relaxed = true;
            // Don't return as often this is part of a more specific tag
          }
          if (tag.name.toLowerCase().includes("subtitles")) {
            accessibility.subtitled = true;
            // Don't return as often this is part of a more specific tag
          }

          notesList.push(tag.name);
        });

        const performance = createPerformance({
          date: parseDateTime(
            showTime.session_start_date,
            showTime.show_time_slots,
          ),
          notesList,
          url: `${attributes.domain}/movies/${movie.url_key}/showtimes/${showTime.session_start_date}/${attributes.location}/seat-plan?showtime=${showTime.show_time_uuid}`,
          screen: showTime.screen_name,
          status: {
            soldOut: showTime.sold_out || false,
          },
          accessibility: createAccessibility(movie.movie_name, accessibility),
        });

        movieEntry.performances.push(performance);
      }
    }
  }

  // Convert map to array
  const movies = Array.from(moviesMap.values());

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
