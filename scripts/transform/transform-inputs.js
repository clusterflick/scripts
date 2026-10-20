const fs = require("node:fs").promises;
const path = require("node:path");
const { readJSON, writeJSON } = require("../../common/utils");
const {
  getYesterdaysRelease,
  downloadReleaseAssets,
} = require("./get-releases");
const { getHistoricalData } = require("./get-historical-seen");
const getPlacedShowingIds = require("./placed-showing-ids");

// Everything a transform needs besides its own venue's retrieved data is the
// same for every venue in a run: the first-seen map folded from the last ten
// days of combined data, yesterday's transformed release, and where each
// source places its showings across every venue. Each venue is its own
// process, so building those per venue meant parsing ~175MB of combined data
// and asking the GitHub API for the release list 400-odd times a run - and
// sweeping every source over every cinema, minutes apiece, for each venue that
// had dropped a sourced showing. They are built once here instead, and every
// venue reads the result.
//
// Building them once also means every venue in a run is judged against the
// same previous release - per venue, a run straddling midnight could compare
// its early venues against one day's release and its late ones against the
// next.
const INPUTS_DIRECTORY = "transform-inputs";
const HISTORICAL_SEEN_FILE = "historical-seen.json";
const PLACED_SHOWING_IDS_FILE = "placed-showing-ids.json";
const PREVIOUS_RELEASE_DIRECTORY = "previous-release";

const getInputsPath = (...segments) =>
  path.join(process.cwd(), INPUTS_DIRECTORY, ...segments);

async function prepareTransformInputs() {
  const previousReleasePath = getInputsPath(PREVIOUS_RELEASE_DIRECTORY);
  // Cleared first so a local re-run can't leave an older release's venues
  // mixed in with this one's.
  await fs.rm(getInputsPath(), { recursive: true, force: true });
  await fs.mkdir(previousReleasePath, { recursive: true });

  console.log("Loading historical data ...");
  const seenMap = await getHistoricalData();
  await writeJSON(
    getInputsPath(HISTORICAL_SEEN_FILE),
    Object.fromEntries(seenMap),
  );

  // Reads this run's retrieved data, which must be in place before this runs:
  // a source missing here is read as having nothing retrieved.
  console.log("Finding where each source places its showings ...");
  const start = Date.now();
  const placedShowingIds = await getPlacedShowingIds();
  await writeJSON(getInputsPath(PLACED_SHOWING_IDS_FILE), placedShowingIds);
  console.log(
    ` - Swept ${Object.keys(placedShowingIds).length} sources (${Math.round((Date.now() - start) / 1000)}s)`,
  );

  console.log("Downloading yesterday's release ...");
  const release = await getYesterdaysRelease();
  if (!release) {
    // Not an error: the same as before, when each venue found no release and
    // carried nothing forward. The directory is still written, empty, so a
    // transform can tell "no release yesterday" from "never prepared".
    console.log(" - No release published yesterday, nothing to carry forward");
    return;
  }
  const count = await downloadReleaseAssets(release, previousReleasePath);
  console.log(` - Downloaded ${count} venues from ${release.tag_name}`);
}

async function readTransformInputs(location) {
  const historicalSeenPath = getInputsPath(HISTORICAL_SEEN_FILE);
  const previousReleasePath = getInputsPath(PREVIOUS_RELEASE_DIRECTORY);

  let historicalSeen;
  let placedShowingIds;
  try {
    historicalSeen = await readJSON(historicalSeenPath);
    placedShowingIds = await readJSON(getInputsPath(PLACED_SHOWING_IDS_FILE));
    await fs.access(previousReleasePath);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    throw new Error(
      `Transform inputs not found at ${getInputsPath()}; run \`transform-prepare\` first`,
      { cause: e },
    );
  }

  // A venue missing from yesterday's release - a new venue, or no release at
  // all - carries nothing forward, as it always has.
  let previousRelease;
  try {
    previousRelease = await readJSON(path.join(previousReleasePath, location));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  return {
    previousRelease,
    historicalSeen: new Map(Object.entries(historicalSeen)),
    placedShowingIds: new Map(
      Object.entries(placedShowingIds).map(([source, ids]) => [
        source,
        new Set(ids),
      ]),
    ),
  };
}

module.exports = {
  prepareTransformInputs,
  readTransformInputs,
};
