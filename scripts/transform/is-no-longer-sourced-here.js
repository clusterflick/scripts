const fs = require("node:fs");
const path = require("node:path");
const { getAllSourceNames, getSourceAttributes } = require("../../sources");

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
//
// Where each source places its events is the same for every venue, and costs a
// findEvents call per source per cinema, so `transform-prepare` builds it once
// a run - see placed-showing-ids.js.
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

/**
 * Did a movie from the previous release come from a source that now places it
 * at a different venue?
 *
 * @param {Object} movie - Movie from the previous release
 * @param {Object} attributes - Attributes of the venue being transformed
 * @param {Object} sourcedEvents - This run's source results, keyed by source
 * @param {Map<string, Set<string>>} placedShowingIds - Showing ids each source
 *   places at any venue this run, from `transform-prepare`
 * @returns {boolean} True if the source has moved it to another venue
 */
function isNoLongerSourcedHere(
  movie,
  attributes,
  sourcedEvents,
  placedShowingIds,
) {
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
  // The source has data, so the sweep must have covered it; prepared without
  // it means prepared from different retrieved data than this run's.
  const placed = placedShowingIds.get(source.name);
  if (!placed) {
    throw new Error(
      `No placed showing ids for ${source.name}, which has retrieved data; was \`transform-prepare\` run against this run's retrieved data?`,
    );
  }
  return placed.has(showingId);
}

module.exports = isNoLongerSourcedHere;
