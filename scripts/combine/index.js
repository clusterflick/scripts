const path = require("node:path");
const normalizeTitle = require("../../common/normalize-title");
const { getAllCinemaNames, getCinemaAttributes } = require("../../cinemas");
const {
  getMovieInfoAndCacheResults,
  getMovieGenresAndCacheResults,
} = require("../../common/get-movie-data");
const {
  parseMinsToMs,
  readJSON,
  basicNormalize,
  getId,
  sleep,
} = require("../../common/utils");
const standardizePrefixingForTheatrePerformances = require("../../common/standardize-prefixing-for-theatre-performances");

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

const buildMovieData = (movieInfo, { slugify, siteData }) => {
  const directors = getDirectors(movieInfo);
  const actors = getActors(movieInfo);
  const genres = getGenres(movieInfo);

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
    title,
    normalizedTitle: normalizeTitle(title).replace(/^the /i, "").trim(),
    classification: getClassification(movieInfo),
    overview: movieInfo.overview,
    year: movieInfo.release_date?.split("-")[0],
    releaseDate: movieInfo.release_date,
    duration: parseMinsToMs(movieInfo.runtime),
    directors: directors.map(({ id }) => id),
    actors: actors.map(({ id }) => id),
    genres: genres.map(({ id }) => id),
    imdbId: getImdbId(movieInfo),
    youtubeTrailer: getYoutubeTrailer(movieInfo),
    posterPath: movieInfo.poster_path,
  };
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

  const siteData = {
    venues: {},
    people: {},
    genres: {},
    movies: {},
  };

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
              buildMovieData(includedMovieInfo, { slugify, siteData }),
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
            ...buildMovieData(movieInfo, { slugify, siteData }),
            includedMovies: [],
            showings: {},
            performances: [],
          };
        } else {
          siteData.movies[movieId] = {
            id: movieId,
            title: title,
            normalizedTitle: normalizeTitle(title),
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
          }) => ({
            showingId,
            time,
            notes: notes !== "" ? notes : undefined,
            bookingUrl,
            screen,
            status: Object.keys(status).length > 0 ? status : undefined,
            accessibility:
              Object.keys(accessibility).length > 0 ? accessibility : undefined,
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
    container.title = standardizePrefixingForTheatrePerformances(
      container.title,
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

  return siteData;
}

module.exports = combine;
