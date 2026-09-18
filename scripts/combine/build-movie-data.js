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

/**
 * TheMovieDB's own measure of how much attention a person is getting, carried
 * through from the credit record.
 *
 * It is a rolling trending score rather than a measure of standing - it is
 * recomputed daily from page views and searches, so it rises and falls with
 * whatever is in the news. Treat it as a tie-break between people who are
 * otherwise indistinguishable, never as a ranking in its own right; that is how
 * `rankPeople` in `common/get-movie-data.js` already uses it, behind an exact
 * name match and the person's department.
 *
 * Published raw. Rounding is a payload decision and belongs to whoever is
 * paying for the bytes - the website buckets it before it reaches the client.
 *
 * Absent on a credit TheMovieDB has no score for, rather than defaulted to
 * zero: no score and a score of zero are different claims, and a consumer
 * breaking a tie needs to be able to tell them apart.
 */
const getPopularity = ({ popularity }) =>
  typeof popularity === "number" ? popularity : undefined;

const getDirectors = (movie) => {
  const crew = movie.credits?.crew ?? [];
  return crew
    .filter(({ job }) => basicNormalize(job) === "director")
    .map((person) => ({
      id: `${person.id}`,
      name: person.name,
      popularity: getPopularity(person),
    }));
};

const getActors = (movie) => {
  const cast = movie.credits?.cast ?? [];
  return Array.from(
    cast
      .sort((a, b) => a.order - b.order)
      .reduce((actors, person) => {
        if (actors.has(person.id)) return actors;
        actors.set(person.id, {
          id: `${person.id}`,
          name: person.name,
          popularity: getPopularity(person),
        });
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

// Independent of getOriginalTitle: a film can share its original-language
// title with the display title (e.g. "Roma") and still be worth flagging as
// non-English.
const getOriginalLanguage = ({ original_language: originalLanguage }) =>
  originalLanguage && originalLanguage !== "en" ? originalLanguage : undefined;

/**
 * Add a person to siteData, keeping the highest popularity seen for them.
 *
 * A person credited on several films arrives once per film, and each film's
 * TheMovieDB record was cached at a different time - so the same person carries
 * a different popularity snapshot in each. Overwriting would leave the value
 * decided by whichever cinema happened to be read last: stable within a run,
 * but arbitrary, and liable to change under an unrelated reordering.
 *
 * The maximum is order-independent, so re-running a release reproduces it, and
 * it is the least dulled by a stale cache entry - the score decays between
 * fetches, so the highest snapshot is the freshest-looking rather than the
 * oldest.
 *
 * @param {object} siteData - Receives the person
 * @param {{id: string, name: string, popularity?: number}} person
 */
const registerPerson = (siteData, person) => {
  const existing = siteData.people[person.id];
  if (!existing) {
    siteData.people[person.id] = person;
    return;
  }
  if (
    person.popularity !== undefined &&
    (existing.popularity === undefined ||
      person.popularity > existing.popularity)
  ) {
    existing.popularity = person.popularity;
  }
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
  directors.forEach((crew) => registerPerson(siteData, crew));
  actors.forEach((cast) => registerPerson(siteData, cast));
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
    originalLanguage: getOriginalLanguage(movieInfo),
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
