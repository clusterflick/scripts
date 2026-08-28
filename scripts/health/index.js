const {
  getAllCinemaAttributes,
  getAllCinemaNames,
  getCinema,
} = require("../../cinemas");
const standDownForClosure = require("./stand-down-for-closure");

// Chain probes are group-wide rather than per venue: one listing call answers
// the whole estate, so batching them is the point and a venue on its own is the
// wrong unit. The key is the id prefix the chain's venues share, which is also
// the directory the probe lives in.
const groupProbes = {
  "bfi.org.uk": require("../../common/bfi.org.uk/health"),
  "cineworld.co.uk": require("../../common/cineworld.co.uk/health"),
  "curzon.com": require("../../common/curzon.com/health"),
  "everymancinema.com": require("../../common/everymancinema.com/health"),
  "myvue.com": require("../../common/myvue.com/health"),
  "odeon.co.uk": require("../../common/odeon.co.uk/health"),
  "picturehouses.com": require("../../common/picturehouses.com/health"),
};

// A challenge, a source in maintenance or holding visitors in a queue, or a
// venue with nothing on, is an observation about the source; the job stays
// green and the row records what was seen. These two mean something is wrong on
// our side - an id we track has gone, or the probe couldn't complete - and the
// job goes red once the rows are safely written. See index.js.
const FAILURE_KINDS = new Set(["unknown-venue-id", "probe-error"]);

// A location is either a chain group or a single venue. A venue that isn't part
// of a batched chain carries its own probe as an optional `health` export
// alongside `retrieve` and `transform`, so adding one for a standalone cinema
// means writing `health.js` in its directory - no registry entry needed.
const resolve = (location) => {
  if (groupProbes[location]) {
    return {
      probe: groupProbes[location],
      venues: getAllCinemaAttributes().filter(({ id }) =>
        id.startsWith(`${location}-`),
      ),
    };
  }

  if (getAllCinemaNames().includes(location)) {
    const { attributes, health } = getCinema(location);
    if (!health) {
      throw new Error(
        `Venue "${location}" has no health probe. Add a health.js to its directory, or use one of the chain groups: ${Object.keys(groupProbes).join(", ")}`,
      );
    }
    // Handed an array either way, so a probe never has to care whether it was
    // called for one venue or nineteen.
    return { probe: health, venues: [attributes] };
  }

  throw new Error(
    `No health probe for "${location}". Available groups: ${Object.keys(groupProbes).join(", ")}`,
  );
};

// A closure is worth spelling out in the log - which closure, and until when -
// so a reader can tell a stand-down we declared from one we forgot to delete.
const describeReason = (reason) => {
  if (reason.kind === "expected-closure") {
    return `${reason.kind} (${reason.observed}) - closed until ${reason.until} for ${reason.closedFor}`;
  }
  // Which waiting room, and what it is queueing for - the difference between
  // "BFI is busy" and "BFI's festival on-sale opened this morning".
  if (reason.kind === "source-queue") {
    return `${reason.kind} - held at ${reason.queue}${reason.event ? ` for ${reason.event}` : ""}`;
  }
  return reason.kind;
};

async function health(location) {
  const { probe, venues } = resolve(location);
  if (venues.length === 0) {
    throw new Error(`No venues found for "${location}"`);
  }

  console.log(`[🩺 Location: ${location}] probing ${venues.length} venues`);
  // Applied here rather than in each probe: any chain can delist a venue it has
  // shut, so the carve-out belongs beside the decision about which kinds fail
  // the job rather than repeated per chain. See stand-down-for-closure.js.
  const rows = (await probe(venues)).map(standDownForClosure);

  // A probe may decline a venue the group contains - Everyman's pop-up is fed
  // from a hosted CSV, not the chain API. Say so rather than letting the row
  // count quietly disagree with the count above.
  if (rows.length !== venues.length) {
    console.log(
      ` - ${venues.length - rows.length} venue(s) not on this chain's API, not probed`,
    );
  }

  for (const { venue, counts, reason } of rows) {
    // Counts are rendered from whatever the probe reported rather than named
    // here: a chain answering with a film x date matrix and one answering with
    // individual performances count different things, and the log shouldn't
    // pretend otherwise.
    const outcome = reason
      ? `${FAILURE_KINDS.has(reason.kind) ? "❌" : "⚠️ "} ${describeReason(reason)}`
      : `✅ ${Object.entries(counts)
          .map(
            ([name, count]) =>
              `${count} ${name.replace(/([A-Z])/g, " $1").toLowerCase()}`,
          )
          .join(", ")}`;
    console.log(` - ${venue.padEnd(34)} ${outcome}`);
  }

  return rows;
}

module.exports = health;
module.exports.FAILURE_KINDS = FAILURE_KINDS;
