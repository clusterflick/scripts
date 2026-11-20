const fs = require("node:fs").promises;
const path = require("node:path");
const { readJSON } = require("../utils");

/**
 * Where the reviewed data lives. It is committed rather than released: every
 * change to it is a fact someone has to approve, and a pull request against
 * these files is that review - the diff is the queue, the merge is the
 * approval.
 */
const DATA_DIRECTORY = path.join(__dirname, "..", "..", "accessibility");
const VENUES_DIRECTORY = path.join(DATA_DIRECTORY, "venues");
const SOURCES_PATH = path.join(DATA_DIRECTORY, "sources.json");

const getRecordPath = (id, directory = VENUES_DIRECTORY) =>
  path.join(directory, `${id}.json`);

/**
 * Every venue's record, in id order.
 *
 * @param {string} [directory]
 * @returns {Promise<object[]>}
 */
async function readRecords(directory = VENUES_DIRECTORY) {
  const files = (await fs.readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const record = await readJSON(path.join(directory, file));
      const expected = path.basename(file, ".json");
      if (record.id !== expected) {
        throw new Error(`${file} holds the record for "${record.id}"`);
      }
      return record;
    }),
  );
}

/**
 * The source registry: for each venue, the pages its facts are read from.
 *
 * @param {string} [filePath]
 * @returns {Promise<Record<string, Array<{ url: string, tier: number, selector?: string }>>>}
 */
const readSources = (filePath = SOURCES_PATH) => readJSON(filePath);

module.exports = {
  DATA_DIRECTORY,
  VENUES_DIRECTORY,
  SOURCES_PATH,
  getRecordPath,
  readRecords,
  readSources,
};
