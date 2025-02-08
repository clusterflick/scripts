const path = require("node:path");
const crypto = require("node:crypto");
const getModuleNamesFor = require("../../common/get-module-names-for");
const normalizeTitle = require("../../common/normalize-title");
const {
  getMovieInfoAndCacheResults,
  getMovieGenresAndCacheResults,
} = require("../../common/get-movie-data");
const { parseMinsToMs, readJSON } = require("../../common/utils");
const standardizePrefixingForTheatrePerformances = require("../../common/standardize-prefixing-for-theatre-performances");

const basicNormalize = (value) => value.toLowerCase().trim();

const getId = (value) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);

const getClassification = ({ release_dates: { results } }) => {
  const result = results.find(({ iso_3166_1: locale }) => locale === "GB");
  if (!result) return undefined;

  const { release_dates: releaseDates } = result;
  const releaseDateWithClassification = releaseDates.find(
    ({ certification }) => !!certification,
  );

  if (!releaseDateWithClassification) return undefined;
  return releaseDateWithClassification.certification;
};

const getDirectors = ({ credits: { crew } }) =>
  crew
    .filter(({ job }) => basicNormalize(job) === "director")
    .map(({ id, name }) => ({ id: `${id}`, name }));

const getActors = ({ credits: { cast } }) =>
  cast
    .slice(0, 10)
    .filter(({ popularity }) => popularity >= 5)
    .map(({ id, name }) => ({ id: `${id}`, name }));

const getGenres = ({ genres }) =>
  genres.map(({ id, name }) => ({ id: `${id}`, name }));

const getYoutubeTrailer = ({ videos: { results } }) => {
  const trailer = results.find(
    ({ type, site }) =>
      basicNormalize(type) === "trailer" && basicNormalize(site) === "youtube",
  );
  return trailer ? trailer.key : undefined;
};

async function combine() {
  const getImddId = ({ external_ids: externalIds = {} }) => externalIds.imdb_id;
  const cinemasPath = path.join(__dirname, "..", "..", "cinemas");
  const data = {};
  const cinemas = await getModuleNamesFor(cinemasPath);
  for (const cinema of cinemas) {
    try {
      const attributesPath = path.join(cinemasPath, cinema, "attributes");
      const dataPath = path.join(process.cwd(), "transformed-data", cinema);
      data[cinema] = {
        attributes: require(attributesPath),
        movies: await readJSON(dataPath),
      };
    } catch {
      console.log(`Error combining data for ${cinema}`);
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
  const releaseResponse = await fetch(
    "https://api.github.com/repos/clusterflick/data-retrieved/releases/latest",
  );
  const releaseData = await releaseResponse.json();
  siteData.generatedAt = releaseData.published_at;

  for (const cinema in data) {
    console.log(`[🎞️  Cinema: ${cinema}]`);
    const {
      attributes: { name, url, address, geo },
      movies,
    } = data[cinema];
    const venueId = getId(name);

    siteData.venues[venueId] = {
      id: venueId,
      name,
      url,
      address,
      geo,
    };

    const movieGenres = await getMovieGenresAndCacheResults();

    for (const { title, url, overview, performances, themoviedb } of movies) {
      let movieInfo;
      if (themoviedb) {
        const outputTitle = title.slice(0, 35);
        const start = Date.now();
        process.stdout.write(
          ` - Retriving data for ${outputTitle} ... ${"".padEnd(35 - outputTitle.length, " ")}`,
        );
        try {
          movieInfo = await getMovieInfoAndCacheResults(themoviedb);
          console.log(
            `\t✅ Retrieved (${Math.round((Date.now() - start) / 1000)}s)`,
          );
        } catch (e) {
          console.log(`\t❌ Error retriving`);
          throw e;
        }
      }

      const movieId = movieInfo ? `${movieInfo.id}` : getId(title);

      if (!siteData.movies[movieId]) {
        if (movieInfo) {
          const directors = getDirectors(movieInfo);
          const actors = getActors(movieInfo);
          const genres = getGenres(movieInfo);

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

          siteData.movies[movieId] = {
            id: movieId,
            title,
            normalizedTitle: normalizeTitle(title),
            classification: getClassification(movieInfo),
            overview: movieInfo.overview,
            year: movieInfo.release_date.split("-")[0],
            releaseDate: movieInfo.release_date,
            duration: parseMinsToMs(movieInfo.runtime),
            directors: directors.map(({ id }) => id),
            actors: actors.map(({ id }) => id),
            genres: genres.map(({ id }) => id),
            imdbId: getImddId(movieInfo),
            youtubeTrailer: getYoutubeTrailer(movieInfo),
            posterPath: movieInfo.poster_path,
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
            showings: {},
            performances: [],
          };
        }
      }

      const showingId = getId(`${venueId}-${title}`);
      const movie = siteData.movies[movieId];

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
          normalizeTitle(title) !== normalizeTitle(movie.title)
            ? title
            : undefined,
        url,
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

      delete siteData.movies[movie.id];
    });
    siteData.movies[container.id] = container;
  });

  return siteData;
}

module.exports = combine;
