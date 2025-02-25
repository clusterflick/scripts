#!/usr/bin/env node

const fs = require("node:fs").promises;
const path = require("node:path");
const { readJSON, writeJSON } = require("./common/utils");

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
    const getYesterdaysRelease = require("./scripts/transform/get-yesterdays-release");
    const historicData = await getYesterdaysRelease(location);
    const transform = require("./scripts/transform");
    const input = await readJSON(getPath("retrieved-data"));
    const output = await transform(
      location,
      input,
      historicData,
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
