const fs = require("node:fs").promises;
const path = require("node:path");
const { readJSON } = require("../../common/utils");

/**
 * Load all combined data files from the combined-data directory.
 * Returns an array of parsed JSON contents from each release.
 *
 * @returns {Promise<Array<object>>} Array of combined data objects
 */
async function loadCombinedDataFiles() {
  const combinedDataPath = path.join(process.cwd(), "combined-data");
  const results = [];

  let releaseDirs;
  try {
    releaseDirs = await fs.readdir(combinedDataPath);
  } catch (e) {
    if (e.code === "ENOENT") return results;
    throw e;
  }

  // Sort alphabetically to process oldest to newest (tags are date-based)
  releaseDirs.sort();

  for (const releaseDir of releaseDirs) {
    const releasePath = path.join(combinedDataPath, releaseDir);
    const stat = await fs.stat(releasePath);
    if (!stat.isDirectory()) continue;

    const files = await fs.readdir(releasePath);
    for (const file of files) {
      // A data-combined release carries more than one asset - the departed
      // movies bundle among them - and only this one holds showings.
      if (file !== "combined-data.json") continue;

      const filePath = path.join(releasePath, file);
      try {
        const data = await readJSON(filePath);
        if (data.movies) {
          results.push(data);
        } else {
          console.log(` - Warning: Unexpected format for data in ${filePath}`);
        }
      } catch (e) {
        console.log(` - Warning: Could not parse ${filePath}: ${e.message}`);
      }
    }
  }

  return results;
}

/**
 * Build a map of showingId -> earliest seen timestamp from combined data.
 * This allows us to preserve the original "seen" timestamp even if an event
 * temporarily disappears from a venue's site and later reappears.
 *
 * @returns {Promise<Map<string, number>>}
 */
async function getHistoricalData() {
  const combinedDataFiles = await loadCombinedDataFiles();

  if (combinedDataFiles.length === 0) {
    console.log(" - No combined data found, skipping historical seen lookup");
    return new Map();
  }

  const seenMap = new Map();

  for (const data of combinedDataFiles) {
    for (const movie of Object.values(data.movies)) {
      if (!movie.showings) continue;

      for (const [showingId, showing] of Object.entries(movie.showings)) {
        if (typeof showing.seen !== "number") continue;

        // Keep the earliest (oldest) seen value
        const existingSeen = seenMap.get(showingId);
        if (!existingSeen || showing.seen < existingSeen) {
          seenMap.set(showingId, showing.seen);
        }
      }
    }
  }

  console.log(
    ` - Loaded ${seenMap.size} historical seen values from ${combinedDataFiles.length} releases`,
  );

  return seenMap;
}

module.exports = {
  getHistoricalData,
};
