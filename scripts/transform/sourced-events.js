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

// What every source finds at every cinema, this run. A venue's transform needs
// its own slice of this, and isNoLongerSourcedHere needs all of it - where
// each source places its showings across every venue, to tell a screening that
// moved from one a source simply stopped mentioning.
//
// Each transform is its own process, so built per venue it cost every venue a
// findEvents call per source (~2-3s), and every venue that dropped a sourced
// showing a findEvents call per source per cinema (200-330s): rebuilt from
// nothing each time. It is the same answer for every venue, so it is built
// once here and each venue reads its own.
//
// Built once, all of it lands on the critical path ahead of every transform,
// so it is made cheap in three ways. Each source's retrieved data is parsed
// once per worker rather than once per cinema (withReadCache), sources that
// parse pages do it once per file (memoiseOnData), and the cinemas are dealt
// across a worker per core, since what remains is per-cinema matching.
const RETRIEVED_DATA_DIRECTORY = "retrieved-data";

async function sweep(cinemaNames) {
  const cinemas = cinemaNames.map((name) => getCinemaAttributes(name));
  const bySource = {};
  for (const sourceName of getAllSourceNames()) {
    const findEvents = getSourceFindEvents(sourceName);
    // Scoped to the one source, so only one source's data is held at a time.
    bySource[sourceName] = await withReadCache(async () => {
      const found = [];
      for (const cinema of cinemas) found.push(await findEvents(cinema));
      return found;
    });
  }
  // Keyed by source in getAllSourceNames order, as getSourcedEventsFor builds
  // it: venues read it with Object.values, and some keep the first of two
  // copies of an event, so the order is part of the answer.
  return cinemaNames.map((name, index) => [
    name,
    Object.fromEntries(
      Object.entries(bySource).map(([sourceName, found]) => [
        sourceName,
        found[index],
      ]),
    ),
  ]);
}

const runWorker = (cinemaNames) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { cinemaNames } });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Sweep worker exited with ${code}`));
    });
  });

/**
 * @returns {Promise<{
 *   sourcedEvents: Map<string, Object>,
 *   placedShowingIds: Object<string, string[]>,
 * }>} Each cinema's sourced events, keyed by source as getSourcedEventsFor
 *   returns them; and every showing id each source with retrieved data this
 *   run places at any cinema
 */
async function getSourcedEvents() {
  const cinemaNames = getAllCinemaNames();

  // Dealt round-robin rather than in runs, so no worker ends up with a
  // neighbourhood one source happens to place a lot at.
  const workerCount = Math.min(os.availableParallelism(), cinemaNames.length);
  const chunks = Array.from({ length: workerCount }, (_, i) =>
    cinemaNames.filter((_, index) => index % workerCount === i),
  );
  const results = await Promise.all(chunks.map(runWorker));
  const sourcedEvents = new Map(results.flat());

  // A source with nothing retrieved this run has no view on where anything is,
  // and gets no entry: isNoLongerSourcedHere reads that as "no data", so the
  // previous release keeps its say.
  const placedShowingIds = {};
  for (const sourceName of getAllSourceNames()) {
    const dataSrc = path.join(
      process.cwd(),
      RETRIEVED_DATA_DIRECTORY,
      sourceName,
    );
    if (!fs.existsSync(dataSrc)) continue;
    const showingIds = new Set();
    for (const events of sourcedEvents.values()) {
      for (const { showingId } of events[sourceName] ?? []) {
        showingIds.add(showingId);
      }
    }
    placedShowingIds[sourceName] = [...showingIds].sort();
  }

  return { sourcedEvents, placedShowingIds };
}

if (!isMainThread) {
  sweep(workerData.cinemaNames).then((found) => parentPort.postMessage(found));
}

module.exports = getSourcedEvents;
