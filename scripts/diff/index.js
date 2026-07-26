const fs = require("node:fs").promises;
const path = require("node:path");
const { readJSON } = require("../../common/utils");
const { getCinemaAttributes } = require("../../cinemas");
const { compareVenue } = require("./compare-venue");
const {
  computeSummary,
  buildPublishedDiff,
  hasChanges,
} = require("./build-diff");

const emptyVenueDiff = () => ({
  showings: { added: [], removed: [], modified: [] },
  futurePerformances: {
    previousTotal: 0,
    added: 0,
    removed: 0,
    rescheduled: 0,
  },
  tmdbChanges: [],
});

/**
 * Load every venue file in a release directory, keyed by venue id (the file
 * name, which is what every stage of the pipeline uses as the venue id).
 *
 * @param {string} directory - A directory of transformed-data venue files
 * @returns {Promise<Object<string, Array<object>>>}
 */
async function loadVenueData(directory) {
  const venues = {};
  for (const file of (await fs.readdir(directory)).sort()) {
    venues[file] = await readJSON(path.join(directory, file));
  }
  return venues;
}

/**
 * A venue only present in the previous release may have had its cinema module
 * deleted since, so the lookup is allowed to come back empty for that one case
 * rather than failing the whole comparison.
 */
function getVenueName(venueId) {
  try {
    return getCinemaAttributes(venueId).name;
  } catch {
    console.log(` - Warning: No cinema module found for ${venueId}`);
    return null;
  }
}

/**
 * Compare two transformed-data releases.
 *
 * Every venue seen in either release is included in the result, changed or
 * not, so a caller can report on the full picture. Use buildPublishedDiff to
 * reduce this to just what changed.
 *
 * @param {object} options
 * @param {string} options.currentDir - Directory of the current release's venue files
 * @param {string} options.previousDir - Directory of the previous release's venue files
 * @param {string} options.currentTag - Release tag of the current release
 * @param {string} options.previousTag - Release tag of the previous release
 * @returns {Promise<{ metadata: object, summary: object, venues: object }>}
 */
async function compareReleases({
  currentDir,
  previousDir,
  currentTag,
  previousTag,
}) {
  const now = Date.now();

  console.log(`Loading current release from ${currentDir}...`);
  const currentVenues = await loadVenueData(currentDir);
  console.log(`  Found ${Object.keys(currentVenues).length} venue files`);

  console.log(`Loading previous release from ${previousDir}...`);
  const previousVenues = await loadVenueData(previousDir);
  console.log(`  Found ${Object.keys(previousVenues).length} venue files`);

  const allVenueIds = new Set([
    ...Object.keys(currentVenues),
    ...Object.keys(previousVenues),
  ]);

  console.log(`\nComparing ${allVenueIds.size} venues...\n`);

  const venues = {};

  for (const venueId of [...allVenueIds].sort()) {
    const currData = currentVenues[venueId];
    const prevData = previousVenues[venueId];

    const base = {
      name: getVenueName(venueId),
      venueAdded: !prevData && !!currData,
      venueRemoved: !!prevData && !currData,
      venueEmpty: false,
    };

    if (base.venueAdded || base.venueRemoved) {
      venues[venueId] = { ...base, ...emptyVenueDiff() };
      continue;
    }

    const latestShowings = Array.isArray(currData) ? currData : [];
    const previousShowings = Array.isArray(prevData) ? prevData : [];

    venues[venueId] = {
      ...base,
      venueEmpty: previousShowings.length > 0 && latestShowings.length === 0,
      ...compareVenue(latestShowings, previousShowings, now),
    };
  }

  return {
    metadata: {
      currentRelease: currentTag,
      previousRelease: previousTag,
      diffedAt: new Date(now).toISOString(),
      venueCount: allVenueIds.size,
    },
    summary: computeSummary(venues),
    venues,
  };
}

module.exports = {
  compareReleases,
  buildPublishedDiff,
  hasChanges,
};
