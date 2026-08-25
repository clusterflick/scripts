const {
  createOverview,
  createPerformance,
  generateShowingId,
  sanitizeRichText,
  isPrivateHire,
  createAccessibility,
  createFormat,
  getValidFormat,
  basicNormalize,
  getValidClassification,
} = require("../../common/utils");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");

const getNames = (array = []) => array.map(({ name }) => name).filter(Boolean);

// Venues shorten this in their tags, e.g. "English Subs"
const subtitlesPattern = /\bsub(s|title[sd]?)\b/;

// Words an accessibility tag is built from that say nothing beyond the flags
// themselves - a tag made up of only these ("Relaxed Screening (with
// subtitles)") is fully described by its flags, whereas one with anything left
// over ("English Subs") still has something to say as a note
const accessibilityTagWords =
  /\b(relaxed|hoh|hard of hearing|subs|subtitle[sd]?|with|only|screening|version)\b/g;

const isFullyDescribedByAccessibility = (tagName) =>
  basicNormalize(tagName)
    .replace(accessibilityTagWords, "")
    .replace(/\W/g, "") === "";

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
    // Only ever asked for days the venue said it had listings on, so a response
    // without a movies array is a broken one rather than an empty day - an
    // empty array falls through this loop on its own.
    if (!dayPage.data?.movies) {
      throw new Error(
        "Day of listings came back without any movies data - the response shape may have changed",
      );
    }

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
        const format = {};

        // Add language if specified
        if (showTime.movie_language?.name) {
          notesList.push(showTime.movie_language.name);
        }

        showTime.show_times_tags.forEach((tag) => {
          tags.add(tag.name);

          // Capture format tokens (2D/3D dimension, etc.) before the ignore
          // checks below strip "2D"/"Standard" from the notes.
          const formatFromTag = getValidFormat(tag.short_name);
          Object.assign(format, formatFromTag);

          // Ignore pointless tags like "Standard", "2D" and "PG"
          // or if we've already got the format data
          if (
            basicNormalize(tag.short_name) === "standard" ||
            basicNormalize(tag.short_name) === "2d" ||
            !!getValidClassification(tag.name) ||
            Object.keys(formatFromTag).length > 0
          ) {
            return;
          }

          if (
            basicNormalize(tag.name).includes("hoh") ||
            basicNormalize(tag.name).includes("hard of hearing")
          ) {
            accessibility.hardOfHearing = true;
            // The tag often names the subtitle track itself, e.g. "Hard of
            // hearing subtitles". A bare HOH marker isn't taken to imply one,
            // as captions for the D/deaf and a subtitle track are flagged
            // separately elsewhere.
            if (subtitlesPattern.test(basicNormalize(tag.name))) {
              accessibility.subtitled = true;
            }
            return; // this doesn't need added to the notes
          }
          if (basicNormalize(tag.name).includes("parent and baby")) {
            accessibility.babyFriendly = true;
            // E.g. "Parent and Baby Only Screening (with subtitles)"
            if (subtitlesPattern.test(basicNormalize(tag.name))) {
              accessibility.subtitled = true;
            }
            return; // this doesn't need added to the notes
          }

          // Don't return on either of these, as they're often part of a more
          // specific tag that still has something left to say as a note
          const isRelaxed = basicNormalize(tag.name).includes("relaxed");
          if (isRelaxed) accessibility.relaxed = true;
          const isSubtitled = subtitlesPattern.test(basicNormalize(tag.name));
          if (isSubtitled) accessibility.subtitled = true;

          if (
            (isRelaxed || isSubtitled) &&
            isFullyDescribedByAccessibility(tag.name)
          ) {
            return; // this doesn't need added to the notes
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
          accessibility: createAccessibility(
            movie.movie_name,
            accessibility,
            movie.synopsis,
          ),
          format: createFormat(movie.movie_name, format, movie.synopsis),
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
