const fs = require("node:fs");
const path = require("node:path");
const {
  getAllSourceNames,
  getSourceAttributes,
  getSourceFindEvents,
} = require("../../sources");
const { getAllCinemaAttributes } = require("../../cinemas");

// Sources are matched to venues by name and location, so a screening one of
// them lists can move: an organiser books a festival at one cinema, changes it
// to another, and the event keeps its id while its venue field changes. The
// source then finds it at the new venue, and it simply stops appearing at the
// old one.
//
// Recovery can't tell that apart from a venue delisting a screening it is still
// running. It sees a movie that was in the previous release and isn't in this
// one, fetches `movie.url` - the *organiser's* page, which is still up because
// the event is still happening, just somewhere else - and puts it back. Both
// venues then publish the same showingId, and combine fails the release rather
// than attribute a screening to the wrong place.
//
// A move has to be shown, not inferred from an absence. "Was here last run and
// isn't now" is recovery's own trigger condition, so treating it as evidence of
// a move leaves recovery firing only when a source produced no data at all -
// and a source can run to completion and still omit a venue. Fever's catalogue,
// for one, is ranked and capped, and a venue's own page is read only if one of
// its plans placed inside that cap; a run where none does drops the venue
// without anything having moved anywhere.
//
// What separates the two is where the event is now. In a genuine move the
// source still places the event - at its new venue - so its id is in this run's
// results somewhere. An omission leaves it in no venue's results at all, and
// there the previous release still gets a say: the URL check downstream can
// look at the listing and decide on evidence.
const RETRIEVED_DATA_DIRECTORY = "retrieved-data";

let sources = null;
const getSources = () => {
  if (sources === null) {
    sources = getAllSourceNames().map((name) => ({
      name,
      // generateShowingId drops a trailing dash from the id, so the prefix it
      // builds - "thecliq.app-1234" - has to be rebuilt the same way.
      prefix: `${getSourceAttributes(name).id.replace(/-$/, "")}-`,
    }));
  }
  return sources;
};

// Every showing id a source places at a venue we hold, this run. Building it
// costs a findEvents pass over every cinema, so it is memoised: transform runs
// as one process per venue, and a venue that drops one sourced showing usually
// drops several. It is only ever built on the drop path - a run where nothing
// went missing never pays for it.
const placedShowingIds = new Map();

async function getShowingIdsPlacedAnywhere(sourceName) {
  if (!placedShowingIds.has(sourceName)) {
    const findEvents = getSourceFindEvents(sourceName);
    const showingIds = new Set();
    for (const cinema of getAllCinemaAttributes()) {
      for (const event of (await findEvents(cinema)) ?? []) {
        showingIds.add(event.showingId);
      }
    }
    placedShowingIds.set(sourceName, showingIds);
  }
  return placedShowingIds.get(sourceName);
}

/**
 * Did a movie from the previous release come from a source that now places it
 * at a different venue?
 *
 * @param {Object} movie - Movie from the previous release
 * @param {Object} attributes - Attributes of the venue being transformed
 * @param {Object} sourcedEvents - This run's source results, keyed by source
 * @returns {Promise<boolean>} True if the source has moved it to another venue
 */
async function isNoLongerSourcedHere(movie, attributes, sourcedEvents) {
  const { showingId } = movie;
  if (typeof showingId !== "string") return false;

  // A venue's own listings carry the venue's id, and a venue id can start with
  // a source's id - "bbk.ac.uk-central" against the "bbk.ac.uk" source - so the
  // venue's own showings are recognised first and never treated as sourced.
  if (showingId.startsWith(`${attributes.id.replace(/-$/, "")}-`)) return false;

  const source = getSources().find(({ prefix }) =>
    showingId.startsWith(prefix),
  );
  if (!source) return false;

  // Nothing retrieved for the source this run, so it has no view to defer to.
  const dataSrc = path.join(
    process.cwd(),
    RETRIEVED_DATA_DIRECTORY,
    source.name,
  );
  if (!fs.existsSync(dataSrc)) return false;

  // The source still places it here, so whatever dropped it happened after the
  // source spoke. Not a move; let the URL check decide.
  if (
    (sourcedEvents[source.name] ?? []).some(
      (event) => event.showingId === showingId,
    )
  ) {
    return false;
  }

  // Gone from this venue: a move only if the source has put it somewhere else.
  return (await getShowingIdsPlacedAnywhere(source.name)).has(showingId);
}

module.exports = isNoLongerSourcedHere;
