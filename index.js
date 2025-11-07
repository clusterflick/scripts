#!/usr/bin/env node

const fs = require("node:fs").promises;
const path = require("node:path");
const { readJSON, writeJSON, sanitizePathSegment } = require("./common/utils");

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

  if (action.toLowerCase() === "cache") {
    const cacheMoviedb = require("./scripts/cache");
    const output = await cacheMoviedb();
    await setupDirectory("cached-data");
    await writeJSON(
      path.join(process.cwd(), "cached-data", "moviedb-data.json"),
      output,
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
      getLatestRelease,
    } = require("./scripts/transform/get-releases");
    const transform = require("./scripts/transform");
    const input = await readJSON(getPath("retrieved-data"));
    const releaseList = await getReleaseList();
    const yesterdaysRelease = await getYesterdaysRelease(location, releaseList);
    const latestRelease = await getLatestRelease(location, releaseList);
    const output = await transform(
      location,
      input,
      yesterdaysRelease,
      latestRelease,
      ...parameters,
    );
    await writeJSON(
      getPath("transformed-data"),
      output.sort((a, b) => a.title.localeCompare(b.title)),
    );
    return;
  }

  throw new Error(`Unknown action provided, ${action}`);
})();
