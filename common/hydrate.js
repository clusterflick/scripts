const slugify = require("slugify");
const { format } = require("date-fns");
const { parseMinsToMs } = require("./utils");
const normalizeTitle = require("./normalize-title");
const {
  searchForBestMatch,
  getMovieInfoAndCacheResults,
} = require("./get-movie-data");

const getMovieTitleAndYearFrom = (title) => {
  const hasYear = title.trim().match(/^(.*?)\s*\((\d{4})\)$/);
  if (hasYear)
    return {
      title: hasYear[1].trim(),
      year: hasYear[2],
    };
  return { title };
};

async function hydrate(shows) {
  const hydratedShows = [];
  for (show of shows) {
    const title = normalizeTitle(show.title, { retainYear: true });
    const { title: normalizedTitle, year } = getMovieTitleAndYearFrom(title);
    const slug = slugify(normalizedTitle, { strict: true }).toLowerCase();
    const result = await searchForBestMatch({
      normalizedTitle,
      slug,
      show,
      year: year || show.overview.year,
    });

    // If there's no best match, just move on
    if (!result) {
      hydratedShows.push(show);
      continue;
    }

    if (!show.overview.duration) {
      try {
        const movieInfo = await getMovieInfoAndCacheResults({ id: result.id });
        if (movieInfo.runtime) {
          show.overview.duration = parseMinsToMs(movieInfo.runtime);
        }
      } catch (e) {
        // Nothing to be done if the movieBD is having an issue!
        // This can happen if the match has been removed, but is still being
        // returned by the search API - looking up the movie will return 404
      }
    }

    // If the result doesn't have a release date, default it to the date of
    // the first performance.
    const defaultReleaseDate = format(
      new Date(show.performances[0].time),
      "yyyy-MM-dd",
    );
    hydratedShows.push({
      ...show,
      moviedb: {
        id: result.id,
        title: result.title,
        releaseDate: result.release_date || defaultReleaseDate,
        summary: result.overview,
      },
    });
  }
  return hydratedShows;
}

module.exports = hydrate;
