const path = require("node:path");
const normalizeTitle = require("../../common/normalize-title");
const { getAllCinemaNames, getCinemaAttributes } = require("../../cinemas");
const {
  getMovieInfoAndCacheResults,
  getMovieGenresAndCacheResults,
  getCollectionInfoAndCacheResults,
} = require("../../common/get-movie-data");
const {
  readJSON,
  basicNormalize,
  getId,
  sleep,
} = require("../../common/utils");
const standardizePrefixingForTheatrePerformances = require("../../common/standardize-prefixing-for-theatre-performances");
const stripSerialBlockSuffix = require("../../common/strip-serial-block-suffix");
const assertUniqueShowingIds = require("./assert-unique-showing-ids");
const { buildMovieData } = require("./build-movie-data");

/**
 * Smallest collection worth a page, counted against *released* parts. The floor
 * is low because MINIMUM_COLLECTION_FILMS_SHOWING does the real filtering: a
 * two-film collection only qualifies when both films are screening, which is a
 * stronger signal than any size rule. Below two there's no series to speak of.
 */
const MINIMUM_COLLECTION_PARTS = 2;

/**
 * Collections that clear the rules but aren't franchises - documentary strands
 * and the like, where the "series" is a publishing label rather than a story,
 * and the run isn't something anyone works through. Kept as a list rather than
 * a size limit: what's wrong with these is what they are, not how big they are,
 * and a size limit would take James Bond with them.
 */
const ignoredCollectionIds = [
  1035073, // Exhibition on Screen -- https://www.themoviedb.org/collection/1035073
];

/**
 * How many of a collection's films must actually be screening for it to be
 * published. Almost every collection has exactly one film on at any moment, and
 * a page built around a single bookable title amongst two dozen you can't see
 * says nothing the film's own page doesn't. Two or more is a run worth a page.
 */
const MINIMUM_COLLECTION_FILMS_SHOWING = 2;

const isReleasedPart = ({ release_date: releaseDate }) => !!releaseDate;

const buildCollection = (collectionInfo, { name, slugify, siteData }) => {
  const parts = (collectionInfo.parts ?? [])
    .filter(isReleasedPart)
    .sort((a, b) => a.release_date.localeCompare(b.release_date))
    .map(
      ({ id, title, release_date: releaseDate, poster_path: posterPath }) => ({
        id: `${id}`,
        title,
        releaseDate,
        posterPath,
      }),
    );

  if (parts.length < MINIMUM_COLLECTION_PARTS) return undefined;

  // Two collections can slugify identically ("Alien Collection" and "Aliens
  // Collection" both give "alien"), and the slug is the page URL, so fall back
  // to disambiguating with the TMDB id.
  const baseSlug = slugify(name);
  const isTaken = Object.values(siteData.collections).some(
    (collection) => collection.slug === baseSlug,
  );

  return {
    id: `${collectionInfo.id}`,
    name,
    slug: isTaken ? `${baseSlug}-${collectionInfo.id}` : baseSlug,
    overview: collectionInfo.overview,
    // TMDB doesn't always have artwork for a collection. Fall back to the
    // earliest film's poster - the first instalment is what a series is
    // recognised by - so consumers always have an image to show.
    posterPath:
      collectionInfo.poster_path ??
      parts.find((part) => part.posterPath)?.posterPath,
    backdropPath: collectionInfo.backdrop_path,
    parts,
  };
};

/**
 * Registers the collection a movie belongs to in siteData and returns its id,
 * or undefined when the movie has no collection or the collection is too small
 * to be worth surfacing.
 *
 * Async, unlike its sibling getters here, because a movie's details carry only
 * the collection's *name* - genres, cast and crew all arrive on the same
 * request via append_to_response, but there is no such option for a
 * collection's membership. Getting the films in it means a second call, served
 * from the cached-data artifact when the cache stage has already made it and
 * fetched live when it hasn't.
 */
const getCollectionId = async (
  movieInfo,
  { slugify, siteData, collectionCache, rejectedCollections },
) => {
  const belongsTo = movieInfo.belongs_to_collection;
  if (!belongsTo) return undefined;
  if (ignoredCollectionIds.includes(belongsTo.id)) return undefined;

  const id = `${belongsTo.id}`;
  if (siteData.collections[id]) return id;
  // A collection already rejected for being too small shouldn't be looked up
  // again for every other movie in it.
  if (rejectedCollections.has(id)) return undefined;

  let collectionInfo;
  try {
    collectionInfo =
      collectionCache[id] ||
      (await getCollectionInfoAndCacheResults({ id: belongsTo.id }));
  } catch {
    collectionInfo = await getCollectionInfoAndCacheResults({
      id: belongsTo.id,
    });
  }

  const collection = buildCollection(collectionInfo, {
    // TheMovieDB suffixes these "<Franchise> Collection", occasionally
    // parenthesised. The word is noise once they're presented as a set of their
    // own. Whitespace or brackets are required before it so a name that merely
    // ends in those letters ("Recollection") is left alone.
    name: belongsTo.name.replace(/(\s+collection|\s*\(collection\))$/i, ""),
    slugify,
    siteData,
  });

  if (!collection) {
    rejectedCollections.add(id);
    return undefined;
  }

  siteData.collections[id] = collection;
  return id;
};

async function combine() {
  const cachePath = path.join(
    process.cwd(),
    "cached-data",
    "moviedb-data.json",
  );
  let cache = {};
  try {
    cache = await readJSON(cachePath);
  } catch {
    console.log("⚠️ Unable to load cached data");
  }

  const collectionCachePath = path.join(
    process.cwd(),
    "cached-data",
    "moviedb-collections.json",
  );
  let collectionCache = {};
  try {
    collectionCache = await readJSON(collectionCachePath);
  } catch {
    console.log("⚠️ Unable to load cached collection data");
  }

  const data = {};
  const cinemas = getAllCinemaNames();
  for (const cinema of cinemas) {
    try {
      const dataPath = path.join(process.cwd(), "transformed-data", cinema);
      data[cinema] = {
        attributes: getCinemaAttributes(cinema),
        movies: await readJSON(dataPath),
      };
    } catch (e) {
      console.log(`Error combining data for ${cinema}`);
      console.log(e);
    }
  }

  assertUniqueShowingIds(data);

  const siteData = {
    venues: {},
    people: {},
    genres: {},
    collections: {},
    movies: {},
  };

  // Collections too small to be worth a page, remembered so every other movie
  // in them doesn't trigger the same lookup and rejection.
  const rejectedCollections = new Set();

  // Use the same slugify library as the website
  const { default: slugify } = await import("@sindresorhus/slugify");
  const { Octokit } = await import("@octokit/core");

  const octokit = new Octokit({ auth: process.env.PAT });
  let response = await octokit.request(
    "GET /repos/clusterflick/data-retrieved/releases/latest",
  );

  if (!response.data.published_at) {
    console.warn("Unexpected response from GitHub releases API, retrying...");
    await sleep(60_000);
    response = await octokit.request(
      "GET /repos/clusterflick/data-retrieved/releases/latest",
    );
  }

  if (!response.data.published_at) {
    throw new Error(
      `GitHub releases API returned unexpected response: ${JSON.stringify(response)}`,
    );
  }

  siteData.generatedAt = response.data.published_at;

  const movieGenres = await getMovieGenresAndCacheResults();

  const buildContext = {
    slugify,
    siteData,
    resolveCollectionId: (movieInfo) =>
      getCollectionId(movieInfo, {
        slugify,
        siteData,
        collectionCache,
        rejectedCollections,
      }),
  };

  for (const cinema in data) {
    console.log(`[🎞️  Cinema: ${cinema}]`);
    const {
      attributes: {
        id: venueId,
        name,
        socials,
        url,
        address,
        geo,
        structure,
        groupName,
        type,
        programming,
      },
      movies,
    } = data[cinema];

    siteData.venues[venueId] = {
      id: venueId,
      name,
      socials,
      url,
      address,
      geo,
      structure,
      groupName,
      type,
      programming,
    };

    for (const {
      showingId,
      title,
      url,
      category,
      seen,
      overview,
      performances,
      themoviedb,
      themoviedbs,
    } of movies) {
      let movieInfo;
      if (themoviedb) {
        const outputTitle = title.slice(0, 35);
        const start = Date.now();
        process.stdout.write(
          ` - Retriving data for ${outputTitle} ... ${"".padEnd(35 - outputTitle.length, " ")}`,
        );
        try {
          try {
            movieInfo =
              cache[themoviedb.id] ||
              (await getMovieInfoAndCacheResults(themoviedb));
          } catch {
            // Try again to get the data if it fails. The movie info will be
            // cached from the previous run if it was successful.
            process.stdout.write(`\\t🔄`);
            movieInfo = await getMovieInfoAndCacheResults(themoviedb);
          }

          console.log(
            `\t✅ Retrieved (${Math.round((Date.now() - start) / 1000)}s)`,
          );
        } catch (e) {
          console.log(`\t❌ Error retriving`);
          throw e;
        }
      }

      // Process themoviedbs for multiple-movies events
      let includedMovies;
      if (themoviedbs && themoviedbs.length > 0) {
        includedMovies = [];
        for (const tmdbEntry of themoviedbs) {
          try {
            const includedMovieInfo =
              cache[tmdbEntry.id] ||
              (await getMovieInfoAndCacheResults(tmdbEntry));

            includedMovies.push(
              await buildMovieData(includedMovieInfo, buildContext),
            );
          } catch {
            // Skip this included movie if we can't fetch its data
          }
        }
      }

      const movieId = movieInfo ? `${movieInfo.id}` : getId(title);

      if (!siteData.movies[movieId]) {
        if (movieInfo) {
          siteData.movies[movieId] = {
            ...(await buildMovieData(movieInfo, buildContext)),
            includedMovies: [],
            showings: {},
            performances: [],
          };
        } else {
          siteData.movies[movieId] = {
            id: movieId,
            title: title,
            normalizedTitle: normalizeTitle(title).replace(/^the /i, "").trim(),
            isUnmatched: true,
            genres: [],
            includedMovies: [],
            showings: {},
            performances: [],
          };
        }
      }

      const movie = siteData.movies[movieId];

      // Merge includedMovies from this showing into the movie, deduplicating by id
      if (includedMovies && includedMovies.length > 0) {
        const existingIds = new Set(movie.includedMovies.map((m) => m.id));
        for (const included of includedMovies) {
          if (!existingIds.has(included.id)) {
            movie.includedMovies.push(included);
            existingIds.add(included.id);
          }
        }
      }

      if (movie.isUnmatched) {
        const matchedGenres = overview.categories.reduce(
          (matchedCategories, name) => {
            const match = movieGenres.genres.find(
              (movieGenre) =>
                basicNormalize(movieGenre.name) === basicNormalize(name),
            );
            if (match) return [...matchedCategories, match.id];
            return matchedCategories;
          },
          [],
        );

        movie.genres = [...new Set([...movie.genres, ...matchedGenres])];
      }

      movie.showings[showingId] = {
        id: showingId,
        venueId,
        title:
          basicNormalize(title) !== basicNormalize(movie.title)
            ? title
            : undefined,
        url,
        category,
        seen,
        overview,
      };

      movie.performances = movie.performances.concat(
        performances.map(
          ({
            time,
            notes,
            bookingUrl,
            screen,
            status = {},
            accessibility = {},
            format = {},
          }) => ({
            showingId,
            time,
            notes: notes !== "" ? notes : undefined,
            bookingUrl,
            screen,
            status: Object.keys(status).length > 0 ? status : undefined,
            accessibility:
              Object.keys(accessibility).length > 0 ? accessibility : undefined,
            format: Object.keys(format).length > 0 ? format : undefined,
          }),
        ),
      );
    }

    console.log(" ");
  }

  Object.keys(siteData.movies).forEach((movieId) => {
    const id = getId("uncategorised");
    const movie = siteData.movies[movieId];
    if (movie.genres.length === 0) {
      movie.genres = [id];
      siteData.genres[id] = { id, name: "Uncategorised" };
    }
  });

  const potentialCombinations = Object.values(siteData.movies).reduce(
    (collection, movie) => {
      collection[movie.normalizedTitle] =
        collection[movie.normalizedTitle] || [];
      collection[movie.normalizedTitle].push(movie);
      return collection;
    },
    {},
  );

  const confirmedConbinations = Object.values(potentialCombinations).reduce(
    (combinations, group) => {
      if (group.length <= 1) return combinations;

      // Don't try to combine movies which are already matched
      if (group.filter(({ isUnmatched }) => !isUnmatched).length > 1) {
        return combinations;
      }
      // But if there's only 1, we can combine unmatched ones with it
      return {
        ...combinations,
        [group[0].normalizedTitle]: group,
      };
    },
    {},
  );

  Object.values(confirmedConbinations).forEach((group) => {
    const matched = group.find(({ isUnmatched }) => !isUnmatched);
    const shortestName = group.reduce(
      (selected, challenger) =>
        selected.title.length > challenger.title.length ? challenger : selected,
      group[0],
    );
    const container = { ...(matched || shortestName) };
    const originalTitle = container.title;
    container.title = stripSerialBlockSuffix(
      standardizePrefixingForTheatrePerformances(container.title),
    );

    // If we've just updated the container title, add the old title into the
    // existing showings
    if (basicNormalize(container.title) !== basicNormalize(originalTitle)) {
      container.showings = Object.keys(container.showings).reduce(
        (updatedShowings, showingId) => {
          const showing = container.showings[showingId];
          return {
            ...updatedShowings,
            [showingId]: { ...showing, title: originalTitle },
          };
        },
        {},
      );
    }

    group.forEach((movie) => {
      if (movie.id === container.id) return;
      // Add showing title in case it doesn't match container title
      movie.showings = Object.keys(movie.showings).reduce(
        (updatedShowings, showingId) => {
          const showing = movie.showings[showingId];
          if (
            showing.title ||
            basicNormalize(movie.title) === basicNormalize(container.title)
          ) {
            return { ...updatedShowings, [showingId]: showing };
          }
          return {
            ...updatedShowings,
            [showingId]: { ...showing, title: movie.title },
          };
        },
        {},
      );
      // TODO: Merge genres? movie.genres
      container.showings = { ...container.showings, ...movie.showings };
      container.performances = [
        ...container.performances,
        ...movie.performances,
      ];

      // Merge includedMovies, deduplicating by id
      if (movie.includedMovies && movie.includedMovies.length > 0) {
        const existingIds = new Set(
          (container.includedMovies || []).map((m) => m.id),
        );
        container.includedMovies = container.includedMovies || [];
        for (const included of movie.includedMovies) {
          if (!existingIds.has(included.id)) {
            container.includedMovies.push(included);
            existingIds.add(included.id);
          }
        }
      }

      delete siteData.movies[movie.id];
    });
    siteData.movies[container.id] = container;
  });

  // A collection only earns its place if you could actually work through some
  // of it: a page listing one bookable film among twenty-five you can't see is
  // a mirror of TheMovieDB, not a listing. Counted after the merge above, since
  // a film can be registered and then merged away, and against the same clock
  // the site uses so the two agree on what "showing" means.
  const asOf = Date.parse(siteData.generatedAt);

  // A film screening inside a double bill or marathon is screening - you can
  // buy a ticket and watch it - so it counts. Tallied as a set of *film* ids
  // rather than a count of listings, because one marathon can carry six films
  // of a collection and would otherwise register as one.
  const showingFilms = new Map();
  const addShowingFilm = (collectionId, filmId) => {
    if (!showingFilms.has(collectionId))
      showingFilms.set(collectionId, new Set());
    showingFilms.get(collectionId).add(filmId);
  };

  Object.values(siteData.movies).forEach((movie) => {
    if (!movie.performances.some(({ time }) => time >= asOf)) return;
    if (movie.collectionId) addShowingFilm(movie.collectionId, movie.id);
    (movie.includedMovies ?? []).forEach((included) => {
      if (included.collectionId) {
        addShowingFilm(included.collectionId, included.id);
      }
    });
  });

  Object.keys(siteData.collections).forEach((collectionId) => {
    const showing = showingFilms.get(collectionId)?.size ?? 0;
    if (showing < MINIMUM_COLLECTION_FILMS_SHOWING) {
      delete siteData.collections[collectionId];
    }
  });

  // Leave no reference pointing at a collection that didn't survive, so every
  // collectionId in the output resolves.
  Object.values(siteData.movies).forEach((movie) => {
    if (movie.collectionId && !siteData.collections[movie.collectionId]) {
      delete movie.collectionId;
    }
    (movie.includedMovies ?? []).forEach((included) => {
      if (
        included.collectionId &&
        !siteData.collections[included.collectionId]
      ) {
        delete included.collectionId;
      }
    });
  });

  console.log(
    `➡️  Collected ${Object.keys(siteData.collections).length} collections`,
  );

  return siteData;
}

module.exports = combine;
