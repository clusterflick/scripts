const normalizeTitle = require("../../common/normalize-title");
const { parseMinsToMs, basicNormalize } = require("../../common/utils");

const getClassification = (movie) => {
  const results = movie.release_dates?.results ?? [];
  const result = results.find(({ iso_3166_1: locale }) => locale === "GB");
  if (!result) return undefined;

  const { release_dates: releaseDates } = result;
  const releaseDateWithClassification = releaseDates.find(
    ({ certification }) => !!certification,
  );

  if (!releaseDateWithClassification) return undefined;
  return releaseDateWithClassification.certification;
};

const getDirectors = (movie) => {
  const crew = movie.credits?.crew ?? [];
  return crew
    .filter(({ job }) => basicNormalize(job) === "director")
    .map(({ id, name }) => ({ id: `${id}`, name }));
};

const getActors = (movie) => {
  const cast = movie.credits?.cast ?? [];
  return Array.from(
    cast
      .sort((a, b) => a.order - b.order)
      .reduce((actors, { id, name }) => {
        if (actors.has(id)) return actors;
        actors.set(id, { id: `${id}`, name });
        return actors;
      }, new Map())
      .values(),
  ).slice(0, 10);
};

const getGenres = ({ genres }) =>
  genres.map(({ id, name }) => ({ id: `${id}`, name }));

const getYoutubeTrailer = (movie) => {
  const results = movie.videos?.results ?? [];
  const trailer = results.find(
    ({ type, site }) =>
      basicNormalize(type) === "trailer" && basicNormalize(site) === "youtube",
  );
  return trailer ? trailer.key : undefined;
};

const getImdbId = ({ external_ids: externalIds = {} }) => externalIds.imdb_id;

// Compared against the final `title` (not `movieInfo.title`) because a
// non-slugifiable title already falls back to `original_title` below - in
// that case they're the same string and there's nothing left to surface.
const getOriginalTitle = (movieInfo, title) => {
  const { original_title: originalTitle, original_language: originalLanguage } =
    movieInfo;
  if (originalLanguage === "en") return undefined;
  if (!originalTitle || originalTitle === title) return undefined;
  return originalTitle;
};

/**
 * Map a TheMovieDB movie record onto the shape the website consumes.
 *
 * This is deliberately the only place that mapping happens. The `title` it
 * picks is what the site slugifies into a movie's URL, so a second
 * implementation drifting from this one would silently move pages - which is
 * why the departed-movies bundle rebuilds its records through here rather than
 * mapping TMDB itself.
 *
 * Not pure: people and genres are registered in `context.siteData` as a side
 * effect, because the site stores them once and references them by id. Callers
 * that only want the movie record - again, the departed bundle - must pass a
 * scratch `siteData` so those registrations don't leak into the combined blob.
 *
 * @param {object} movieInfo - A TMDB movie record
 * @param {object} context
 * @param {Function} context.slugify - The website's slugify implementation
 * @param {object} context.siteData - Receives the movie's people and genres
 * @param {Function} [context.resolveCollectionId] - Registers the movie's
 *   collection and returns its id. Omit to skip collections entirely: it is the
 *   only part of this mapping that can reach the network, and a collection id
 *   is only meaningful alongside a collection page that lists the movie.
 * @returns {Promise<object>} The website's movie record
 */
const buildMovieData = async (movieInfo, context) => {
  const { slugify, siteData, resolveCollectionId } = context;
  const directors = getDirectors(movieInfo);
  const actors = getActors(movieInfo);
  const genres = getGenres(movieInfo);
  const collectionId = resolveCollectionId
    ? await resolveCollectionId(movieInfo)
    : undefined;

  // Register people and genres in siteData
  directors.forEach((crew) => (siteData.people[crew.id] = crew));
  actors.forEach((cast) => (siteData.people[cast.id] = cast));
  genres.forEach((genre) => (siteData.genres[genre.id] = genre));

  // Make sure the title can be slugified for use in URLs. If it can't
  // be we may be trying to use a title in non-roman letters. If so, we
  // can't use it in the URL and it will be harder to search for, so
  // let's try swapping to the original title value.
  const title = slugify(movieInfo.title)
    ? movieInfo.title
    : movieInfo.original_title;

  return {
    id: `${movieInfo.id}`,
    title: title,
    normalizedTitle: normalizeTitle(title).replace(/^the /i, "").trim(),
    originalTitle: getOriginalTitle(movieInfo, title),
    classification: getClassification(movieInfo),
    overview: movieInfo.overview,
    year: movieInfo.release_date?.split("-")[0],
    releaseDate: movieInfo.release_date,
    duration: parseMinsToMs(movieInfo.runtime),
    directors: directors.map(({ id }) => id),
    actors: actors.map(({ id }) => id),
    genres: genres.map(({ id }) => id),
    collectionId,
    imdbId: getImdbId(movieInfo),
    youtubeTrailer: getYoutubeTrailer(movieInfo),
    posterPath: movieInfo.poster_path,
  };
};

module.exports = { buildMovieData };
