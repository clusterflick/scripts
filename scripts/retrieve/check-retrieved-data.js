const fs = require("node:fs").promises;
const path = require("node:path");
const { withReadCache } = require("../../common/utils");
const {
  getAllCinemaNames,
  getCinema,
  getCinemaAttributes,
} = require("../../cinemas");
const { getAllSourceNames, getSourceFindEvents } = require("../../sources");

// A retrieve can succeed with data its transform can't read. On 17th November
// 2026 it happened three times in a day: the Royal Albert Hall's feed answered
// `[]` under a 200, Ticket Tailor listed a date ("Fri 27 Nov 2026, Multiple
// times") its findEvents couldn't parse, and Omniplex changed its film links so
// the retrieve fetched no film pages. Each retrieve passed, a release was cut,
// and the transform failed an hour later - past the step's retries and the
// automatic re-run, which only act on a retrieve that fails. Each one was then
// re-run by hand.
//
// So the retrieve runs the transform's own parse over what it fetched, and
// fails if that throws. Only the parse: a venue's `transform` and a source's
// `findEvents` read the retrieved data and nothing else, before any matching
// or LLM call, so they cost seconds (Barbican, the slowest venue, ~10s; ti.to,
// the slowest source across every cinema, ~18s). Its result is thrown away and
// the raw data is stored as before, so a transform can still be re-run against
// it with newer code.
//
// It runs the transform's code rather than a check of its own for the reason
// Omniplex broke: its retrieve had its own idea of which films were on, and it
// drifted from the transform's. A check written separately drifts the same way.
//
// It reads the file back from disk because a source's findEvents does, and
// because that is what the transform will read - JSON drops what it can't hold.
//
// A venue is parsed with no sourced events, since a venue's retrieve has none.
// Every venue's transform accepts that except those listed here, which need a
// source's data to read their own.
const NEEDS_SOURCED_EVENTS = {
  // Looks up each film's Ticket Tailor event, and throws if it isn't there
  "ibraaz.org": "tickettailor.com",
};

async function checkRetrievedData(location) {
  const dataPath = path.join(process.cwd(), "retrieved-data", location);

  if (getAllSourceNames().includes(location)) {
    const findEvents = getSourceFindEvents(location);
    const cinemas = getAllCinemaNames().map(getCinemaAttributes);
    // Parsed once for every cinema, as transform-prepare does
    const events = await withReadCache(async () => {
      let found = 0;
      for (const cinema of cinemas) found += (await findEvents(cinema)).length;
      return found;
    });
    return { checked: true, events };
  }

  if (NEEDS_SOURCED_EVENTS[location]) {
    console.log(
      ` - ⚠️  Not checked - its transform needs ${NEEDS_SOURCED_EVENTS[location]}'s data`,
    );
    return { checked: false };
  }

  const { transform } = getCinema(location);
  const data = JSON.parse(await fs.readFile(dataPath, "utf8"));
  const movies = await transform(data, {});
  return { checked: true, movies: movies.length };
}

module.exports = { checkRetrievedData, NEEDS_SOURCED_EVENTS };
