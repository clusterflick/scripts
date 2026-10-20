const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("node:worker_threads");
const { withReadCache } = require("../../common/utils");
const { getAllSourceNames, getSourceFindEvents } = require("../../sources");
const { getAllCinemaNames, getCinemaAttributes } = require("../../cinemas");

// Every showing id each source places at any venue we hold, this run - what
// isNoLongerSourcedHere asks to tell a screening that moved venue from one a
// source simply stopped mentioning. Answering it means calling every source's
// findEvents for every cinema, and it is the same answer for every venue, so
// it is built once here rather than by each venue that needs it.
//
// Built per venue it cost ~200-330s of each venue that dropped a sourced
// showing, about ten a run, because each transform is its own process and so
// rebuilt the sweep from nothing. Eventbrite's findEvents parses ~58MB of
// retrieved data on every call; OutSavvy's runs Cheerio over every stored
// event page before filtering to the cinema it was asked about.
//
// Built once, all of it lands on the critical path ahead of every transform,
// so it is made cheap in two ways. Each source's retrieved data is parsed once
// per worker rather than once per cinema (withReadCache), which halves it, and
// the cinemas are dealt across a worker per core, since what remains is
// per-cinema work.
const RETRIEVED_DATA_DIRECTORY = "retrieved-data";

// A source with nothing retrieved this run has no view on where anything is,
// and gets no entry: isNoLongerSourcedHere reads that as "no data", so the
// previous release keeps its say.
const getSourcesWithData = () =>
  getAllSourceNames().filter((name) =>
    fs.existsSync(path.join(process.cwd(), RETRIEVED_DATA_DIRECTORY, name)),
  );

async function sweep(sourceNames, cinemaNames) {
  const cinemas = cinemaNames.map((name) => getCinemaAttributes(name));
  const placed = {};
  for (const sourceName of sourceNames) {
    const findEvents = getSourceFindEvents(sourceName);
    const showingIds = new Set();
    // Scoped to the one source, so only one source's data is held at a time.
    await withReadCache(async () => {
      for (const cinema of cinemas) {
        for (const event of (await findEvents(cinema)) ?? []) {
          showingIds.add(event.showingId);
        }
      }
    });
    placed[sourceName] = [...showingIds];
  }
  return placed;
}

const runWorker = (sourceNames, cinemaNames) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { sourceNames, cinemaNames },
    });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Sweep worker exited with ${code}`));
    });
  });

/**
 * @returns {Promise<Object<string, string[]>>} Showing ids placed at any venue,
 *   keyed by source, for every source with retrieved data this run
 */
async function getPlacedShowingIds() {
  const sourceNames = getSourcesWithData();
  const cinemaNames = getAllCinemaNames();

  // Dealt round-robin rather than in runs, so no worker ends up with a
  // neighbourhood one source happens to place a lot at.
  const workerCount = Math.min(os.availableParallelism(), cinemaNames.length);
  const chunks = Array.from({ length: workerCount }, (_, i) =>
    cinemaNames.filter((_, index) => index % workerCount === i),
  );
  const results = await Promise.all(
    chunks.map((chunk) => runWorker(sourceNames, chunk)),
  );

  return Object.fromEntries(
    sourceNames.map((name) => [
      name,
      [...new Set(results.flatMap((result) => result[name]))].sort(),
    ]),
  );
}

if (!isMainThread) {
  sweep(workerData.sourceNames, workerData.cinemaNames).then((placed) =>
    parentPort.postMessage(placed),
  );
}

module.exports = getPlacedShowingIds;
