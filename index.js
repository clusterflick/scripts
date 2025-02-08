#!/usr/bin/env node

const fs = require("node:fs").promises;
const path = require("node:path");

const readJSON = async (filePath) => {
  const data = await fs.readFile(filePath, "utf8");
  return JSON.parse(data);
};

const writeJSON = async (filePath, value) => {
  const data = JSON.stringify(value, null, 2);
  return await fs.writeFile(filePath, data);
};

const setupDirectory = async (type) => {
  const directoryPath = path.join(".", type);
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

  const getPath = (type) => path.join(".", type, location);
  if (!location) throw new Error("No location provided");

  if (action.toLowerCase() === "retrieve") {
    const retrieve = require("./scripts/retrieve");
    const output = await retrieve(location, ...parameters);
    await setupDirectory("retrieved-data");
    await writeJSON(getPath("retrieved-data"), output);
    return;
  }

  if (action.toLowerCase() === "transform") {
    const transform = require("./scripts/transform");
    const input = await readJSON(getPath("retrieved-data"));
    const output = await transform(location, input, ...parameters);
    await setupDirectory("transformed-data");
    await writeJSON(getPath("transformed-data"), output);
    return;
  }

  throw new Error(`Unknown action provided, ${action}`);
})();
