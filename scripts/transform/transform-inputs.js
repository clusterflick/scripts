const fs = require("node:fs").promises;
const path = require("node:path");
const { readJSON, writeJSON } = require("../../common/utils");
const {
  getReleaseList,
  getYesterdaysRelease,
  downloadReleaseAssets,
} = require("./get-releases");
const { getHistoricalData } = require("./get-historical-seen");

// Everything a transform needs besides its own venue's retrieved data is the
// same for every venue in a run: the first-seen map folded from the last ten
// days of combined data, and yesterday's transformed release. Each venue is its
// own process, so building those per venue meant parsing ~175MB of combined
// data and asking the GitHub API for the release list 400-odd times a run.
// They are built once here instead, and every venue reads the result.
//
// Building them once also means every venue in a run is judged against the
// same previous release - per venue, a run straddling midnight could compare
// its early venues against one day's release and its late ones against the
// next.
const INPUTS_DIRECTORY = "transform-inputs";
const HISTORICAL_SEEN_FILE = "historical-seen.json";
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

  console.log("Downloading yesterday's release ...");
  const release = getYesterdaysRelease(await getReleaseList());
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
  try {
    historicalSeen = await readJSON(historicalSeenPath);
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
  };
}

module.exports = {
  prepareTransformInputs,
  readTransformInputs,
};
