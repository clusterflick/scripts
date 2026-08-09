const fs = require("node:fs").promises;
const path = require("node:path");
const { readJSON } = require("../../common/utils");

/**
 * How long an entry survives after a movie stops appearing in the transformed
 * output. Every entry costs a TheMovieDB fetch in the cache stage and a static
 * page at build time, so this is a work budget rather than a storage one - the
 * file itself is a few tens of kilobytes either way.
 */
const RETENTION_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Release tags are `YYYYMMDD.HHMMSS` in Europe/London. Only the date half is
 * used: retention is measured in days, and pinning the time to midnight UTC
 * keeps the arithmetic free of any timezone or DST reasoning.
 *
 * @param {string} tag - A release tag
 * @returns {number|null} Milliseconds since the epoch, or null if unparseable
 */
function parseTagDate(tag) {
  const match = /^(\d{4})(\d{2})(\d{2})\./.exec(tag ?? "");
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/**
 * Collect the TheMovieDB ids present in a release of transformed data, along
 * with the latest performance time seen for each.
 *
 * Only root-level `themoviedb` matches count. The `themoviedbs` of a
 * multiple-movies event are folded into their parent by the combine stage
 * rather than given pages of their own, so treating them as "seen" would mint
 * departed pages for movies that never had one.
 *
 * @param {string} directory - A directory of transformed-data venue files
 * @returns {Promise<Map<string, number|undefined>>} TMDB id -> last performance
 */
async function getPresentMovies(directory) {
  const present = new Map();

  for (const file of (await fs.readdir(directory)).sort()) {
    const movies = await readJSON(path.join(directory, file));
    if (!Array.isArray(movies)) continue;

    for (const movie of movies) {
      const id = movie.themoviedb?.id;
      if (id === undefined || id === null) continue;

      const times = (movie.performances ?? [])
        .map(({ time }) => time)
        .filter((time) => typeof time === "number");
      const latest = times.length > 0 ? Math.max(...times) : undefined;

      const key = `${id}`;
      // A movie plays at more than one venue, so keep the latest performance
      // across all of them rather than whichever file was read last.
      const known = [present.get(key), latest].filter(
        (time) => typeof time === "number",
      );
      present.set(key, known.length > 0 ? Math.max(...known) : undefined);
    }
  }

  return present;
}

/**
 * Fold a release of transformed data into the seen registry.
 *
 * The registry records `lastSeen` for every movie, showing or not, rather than
 * only for the ones that have gone. That is what keeps this a function of one
 * release plus its own previous state: departure is not an event to be spotted
 * by comparing two releases, it is simply an entry whose `lastSeen` stopped
 * advancing. A movie that returns is stamped again and stops being departed on
 * its own, with no removal path to get wrong, and re-running the same release
 * produces the same registry.
 *
 * Consumers should not read departure off `lastSeen` directly - subtract the
 * ids they can see in the live data instead, which stays correct even when a
 * run publishes nothing.
 *
 * @param {object} options
 * @param {Map<string, number|undefined>} options.present - From getPresentMovies
 * @param {object} [options.previousRegistry] - The last published registry
 * @param {string} options.release - Tag of the release being folded in
 * @param {number} [options.retentionDays] - Days before an absent entry is dropped
 * @returns {object} The registry to publish
 */
function buildRegistry({
  present,
  previousRegistry,
  release,
  retentionDays = RETENTION_DAYS,
}) {
  const releaseDate = parseTagDate(release);
  if (releaseDate === null) {
    throw new Error(
      `Could not parse a date out of release tag "${release}"; expected YYYYMMDD.HHMMSS`,
    );
  }

  const previousMovies = previousRegistry?.movies ?? {};
  const movies = {};
  let pruned = 0;

  // Carry forward everything that is not in this release, dropping whatever has
  // been gone longer than the retention window.
  for (const [id, entry] of Object.entries(previousMovies)) {
    if (present.has(id)) continue;

    const lastSeenDate = parseTagDate(entry.lastSeen);
    // An entry whose tag cannot be read has no age to judge, and silently
    // keeping it forever would hide whatever wrote it.
    if (lastSeenDate === null) {
      throw new Error(
        `Entry ${id} has an unparseable lastSeen tag "${entry.lastSeen}"`,
      );
    }

    if (releaseDate - lastSeenDate > retentionDays * MS_PER_DAY) {
      pruned++;
      continue;
    }

    movies[id] = entry;
  }

  // Stamp everything in this release, keeping the latest performance time we
  // have ever seen for it: once a movie departs, that is the closest thing to
  // "the last time you could have watched it".
  for (const [id, lastPerformance] of present.entries()) {
    const previous = previousMovies[id];
    const previousPerformance = previous?.lastPerformance;
    const latest = [lastPerformance, previousPerformance].filter(
      (time) => typeof time === "number",
    );

    movies[id] = {
      lastSeen: release,
      ...(latest.length > 0 ? { lastPerformance: Math.max(...latest) } : {}),
    };
  }

  const departed = Object.keys(movies).length - present.size;
  console.log(
    `➡️  Registry holds ${Object.keys(movies).length} movies: ${present.size} showing, ${departed} departed (${pruned} pruned)`,
  );

  return {
    metadata: {
      release,
      retentionDays,
      showingCount: present.size,
      departedCount: departed,
    },
    // Sorted so an unchanged registry serialises identically run to run, which
    // makes a diff of two releases readable.
    movies: Object.fromEntries(
      Object.entries(movies).sort(([a], [b]) => Number(a) - Number(b)),
    ),
  };
}

/**
 * Read the previously published registry, if there is one. Its absence is
 * expected on the very first run and whenever the download step found no
 * release to take it from, and means the registry starts over from what is
 * showing today.
 *
 * @param {string} filePath - Path the previous registry was downloaded to
 * @returns {Promise<object|undefined>}
 */
async function readPreviousRegistry(filePath) {
  try {
    return await readJSON(filePath);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    console.log(
      " - No previous registry found; starting from this release's movies",
    );
    return undefined;
  }
}

module.exports = {
  RETENTION_DAYS,
  buildRegistry,
  getPresentMovies,
  parseTagDate,
  readPreviousRegistry,
};
