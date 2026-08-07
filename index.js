#!/usr/bin/env node

const fs = require("node:fs").promises;
const path = require("node:path");
const { readJSON, writeJSON, sanitizePathSegment } = require("./common/utils");
const { getVersion } = require("./common/get-version");

const setupDirectory = async (type) => {
  const directoryPath = path.join(process.cwd(), type);
  let needsCreated = false;
  try {
    needsCreated = !(await fs.stat(directoryPath)).isDirectory();
  } catch (e) {
    needsCreated = e.code === "ENOENT";
  }
  if (needsCreated) await fs.mkdir(directoryPath, { recursive: true });
};

(async function () {
  const [, , action, location, ...parameters] = process.argv;

  console.log(`🏷️  scripts @ ${getVersion()}`);

  if (action.toLowerCase() === "combine") {
    const combine = require("./scripts/combine");
    const output = await combine();
    await setupDirectory("combined-data");
    await writeJSON(
      path.join(process.cwd(), "combined-data", "combined-data.json"),
      output,
    );
    return;
  }

  if (action.toLowerCase() === "match") {
    if (!location) throw new Error("No source provided");

    const match = require("./scripts/match");
    const output = await match(location);
    await setupDirectory("matched-data");
    await writeJSON(
      path.join(
        process.cwd(),
        "matched-data",
        `${sanitizePathSegment(location)}.json`,
      ),
      output,
    );
    return;
  }

  if (action.toLowerCase() === "diff") {
    // Unlike the other stages, diff works on two releases rather than one, so
    // it takes both tags instead of a location, plus the current release's
    // publish time — the diff is anchored to that rather than to the wall
    // clock so a retry reproduces the same result. See scripts/diff.
    const [currentTag, previousTag, currentPublishedAt] = [
      location,
      ...parameters,
    ];
    if (!currentTag || !previousTag) {
      throw new Error("No current and previous release tags provided");
    }
    if (!currentPublishedAt) {
      throw new Error(
        "No published_at provided for the current release; it anchors the diff so repeated runs agree",
      );
    }
    const asOf = Date.parse(currentPublishedAt);
    if (Number.isNaN(asOf)) {
      throw new Error(
        `Could not parse published_at for the current release: ${currentPublishedAt}`,
      );
    }

    const { compareReleases, buildPublishedDiff } = require("./scripts/diff");
    const comparison = await compareReleases({
      currentDir: path.join(process.cwd(), "transformed-data", "current"),
      previousDir: path.join(process.cwd(), "transformed-data", "previous"),
      currentTag,
      previousTag,
      asOf,
    });

    const output = buildPublishedDiff(comparison);
    if (!output) {
      console.log("➡️  No changes between releases; nothing to write");
      return;
    }

    await setupDirectory("diffed-data");
    await writeJSON(
      path.join(process.cwd(), "diffed-data", "diffed-data.json"),
      output,
    );
    console.log(
      `➡️  Diffed ${Object.keys(output.venues).length} changed venues of ${output.metadata.venueCount}`,
    );
    return;
  }

  if (action.toLowerCase() === "cache") {
    const cacheMoviedb = require("./scripts/cache");
    const { movieInfo, collectionInfo } = await cacheMoviedb();
    await setupDirectory("cached-data");
    // Two files rather than one object: moviedb-data.json is read by both the
    // combine and match stages, so its shape has to stay as it is.
    await writeJSON(
      path.join(process.cwd(), "cached-data", "moviedb-data.json"),
      movieInfo,
    );
    await writeJSON(
      path.join(process.cwd(), "cached-data", "moviedb-collections.json"),
      collectionInfo,
    );
    return;
  }

  const getPath = (type) => path.join(process.cwd(), type, location);
  if (!location) throw new Error("No location provided");

  if (action.toLowerCase() === "retrieve") {
    const retrieve = require("./scripts/retrieve");
    const output = await retrieve(location, ...parameters);
    await setupDirectory("retrieved-data");
    await writeJSON(getPath("retrieved-data"), output);
    return;
  }

  if (action.toLowerCase() === "transform") {
    await setupDirectory("transformed-data");
    const {
      getReleaseList,
      getYesterdaysRelease,
    } = require("./scripts/transform/get-releases");
    const {
      getHistoricalData,
    } = require("./scripts/transform/get-historical-seen");
    const transform = require("./scripts/transform");
    const input = await readJSON(getPath("retrieved-data"));
    const releaseList = await getReleaseList();
    const yesterdaysRelease = await getYesterdaysRelease(location, releaseList);
    const seenMap = await getHistoricalData();
    const output = await transform(
      location,
      input,
      yesterdaysRelease,
      seenMap,
      ...parameters,
    );
    await writeJSON(
      getPath("transformed-data"),
      output.sort((a, b) => a.title.localeCompare(b.title)),
    );
    return;
  }

  throw new Error(`Unknown action provided, ${action}`);
})().catch((error) => {
  console.error(`\n❌ ${error.stack || error.message || error}`);
  process.exit(1);
});
