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
 * Collect what a release of transformed data contains, in one pass over the
 * directory: the TheMovieDB ids present with the latest performance time seen
 * for each, and the same for venues.
 *
 * Only root-level `themoviedb` matches count towards movies. The `themoviedbs`
 * of a multiple-movies event are folded into their parent by the combine stage
 * rather than given pages of their own, so treating them as "seen" would mint
 * departed pages for movies that never had one.
 *
 * A venue is present when it has at least one performance, not merely a file.
 * Every cinema module writes a file on every run, empty or not, so file
 * existence would make every venue permanently present and say nothing. Venue
 * performances are counted whether or not their listing matched TheMovieDB: an
 * unmatched film, a quiz or a talk is still the venue putting something on.
 *
 * @param {string} directory - A directory of transformed-data venue files
 * @returns {Promise<{ movies: Map<string, number|undefined>, venues: Map<string, number> }>}
 *   TMDB id -> last performance, and venue id -> last performance
 */
/**
 * The latest performance time across a set of showings, or undefined when
 * there are none to go on.
 *
 * Shared with the combine stage, which stamps the same number onto the venues
 * it publishes: the registry can be a release behind - the diff only publishes
 * when something changed - so combine takes the later of the two, and the two
 * have to be measuring the same thing for that to mean anything.
 *
 * @param {Array<object>} showings - Transformed-data showings
 * @returns {number|undefined}
 */
function getLatestPerformance(showings) {
  const times = (showings ?? [])
    .flatMap(({ performances }) => performances ?? [])
    .map(({ time }) => time)
    .filter((time) => typeof time === "number");

  return times.length > 0 ? Math.max(...times) : undefined;
}

async function getPresent(directory) {
  const movies = new Map();
  const venues = new Map();

  for (const file of (await fs.readdir(directory)).sort()) {
    const showings = await readJSON(path.join(directory, file));
    if (!Array.isArray(showings)) continue;

    // The file name is the venue id, as it is everywhere else in the pipeline.
    const venueLatest = getLatestPerformance(showings);
    if (venueLatest !== undefined) venues.set(file, venueLatest);

    for (const showing of showings) {
      const latest = getLatestPerformance([showing]);

      const id = showing.themoviedb?.id;
      if (id === undefined || id === null) continue;

      const key = `${id}`;
      // A movie plays at more than one venue, so keep the latest performance
      // across all of them rather than whichever file was read last.
      const known = [movies.get(key), latest].filter(
        (time) => typeof time === "number",
      );
      movies.set(key, known.length > 0 ? Math.max(...known) : undefined);
    }
  }

  return { movies, venues };
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
 * @param {Map<string, number|undefined>} options.present - The `movies` of getPresent
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
 * Fold a release of transformed data into the venue registry.
 *
 * The same fold as buildRegistry, with two deliberate differences.
 *
 * Nothing is pruned. The movie registry's retention window is a work budget -
 * every entry costs a TheMovieDB fetch and a static page - and neither applies
 * here: venue attributes come from the cinema modules, so the entry set is
 * bounded by the modules that have ever existed. Pruning would only destroy the
 * signal the registry exists to carry, which is that a venue has been quiet for
 * a long time.
 *
 * `lastSeen` is the later of the entry's own tag and this release's, rather
 * than simply this release's. The daily job only ever folds forward, so the two
 * agree in normal operation; taking the max is what lets a backfill fold
 * releases in any order, and lets a bad seed be re-run over its own output.
 *
 * A venue that has never had a performance gets no entry at all. Its absence is
 * the record: entries are only ever created by a venue putting something on, so
 * "in the cinema modules but not in the registry" is unambiguous, and an entry
 * with nothing in it would say the same thing at greater length.
 *
 * @param {object} options
 * @param {Map<string, number>} options.present - The `venues` of getPresent
 * @param {object} [options.previousRegistry] - The last published venue registry
 * @param {string} options.release - Tag of the release being folded in
 * @returns {object} The venue registry to publish
 */
function buildVenueRegistry({ present, previousRegistry, release }) {
  if (parseTagDate(release) === null) {
    throw new Error(
      `Could not parse a date out of release tag "${release}"; expected YYYYMMDD.HHMMSS`,
    );
  }

  const previousVenues = previousRegistry?.venues ?? {};
  const venues = { ...previousVenues };

  for (const [id, lastPerformance] of present.entries()) {
    const previous = previousVenues[id];
    const times = [lastPerformance, previous?.lastPerformance].filter(
      (time) => typeof time === "number",
    );
    // Release tags are `YYYYMMDD.HHMMSS`, so they order lexicographically.
    const lastSeen =
      previous?.lastSeen && previous.lastSeen > release
        ? previous.lastSeen
        : release;

    venues[id] = { lastSeen, lastPerformance: Math.max(...times) };
  }

  const dormant = Object.keys(venues).length - present.size;
  console.log(
    `➡️  Venue registry holds ${Object.keys(venues).length} venues: ${present.size} active, ${dormant} dormant`,
  );

  return {
    metadata: {
      release,
      activeCount: present.size,
      dormantCount: dormant,
    },
    // Sorted so an unchanged registry serialises identically run to run, which
    // makes a diff of two releases readable.
    venues: Object.fromEntries(
      Object.entries(venues).sort(([a], [b]) => a.localeCompare(b)),
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
      ` - No previous ${path.basename(filePath)} found; starting from this release`,
    );
    return undefined;
  }
}

module.exports = {
  RETENTION_DAYS,
  buildRegistry,
  buildVenueRegistry,
  getLatestPerformance,
  getPresent,
  parseTagDate,
  readPreviousRegistry,
};
