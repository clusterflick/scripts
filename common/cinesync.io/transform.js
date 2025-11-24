const {
  createOverview,
  createPerformance,
  generateShowingId,
  sanitizeRichText,
  isPrivateHire,
} = require("../../common/utils");
const { parse } = require("date-fns");

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

/**
 * Parse date and time from session_start_date and show_time_slots
 */
function parseDateTime(dateStr, timeStr) {
  // dateStr is like "2025-11-24"
  // timeStr is like "2:00pm" or "8:00pm"
  const dateTimeStr = `${dateStr} ${timeStr}`;
  return parse(dateTimeStr, "yyyy-MM-dd h:mma", new Date());
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
          url: `${attributes.domain}/movie/${movie.url_key}`,
          overview: createOverview({
            duration: parseDuration(movie.duration),
            year: movie.movie_year,
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

        // Build booking URL - using the show_time_uuid
        const bookingUrl = `${attributes.domain}/buy-tickets?show_time_uuid=${showTime.show_time_uuid}`;

        const performance = createPerformance({
          date: parseDateTime(
            showTime.session_start_date,
            showTime.show_time_slots,
          ),
          notesList,
          url: bookingUrl,
          screen: showTime.screen_name,
          status: {
            soldOut: showTime.sold_out || false,
          },
          accessibility,
        });

        movieEntry.performances.push(performance);
      }
    }
  }

  console.log(tags);
  // Convert map to array
  const movies = Array.from(moviesMap.values());

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
