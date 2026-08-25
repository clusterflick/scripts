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
// So where a source has spoken this run, it is the authority on which venue its
// screenings are at, and recovery leaves them alone. Only where the source's
// retrieved data is missing does the previous release still get a say: a source
// that produced nothing has said nothing, and dropping every listing it ever
// found would empty venues that are still running the screenings.
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
 * Did a movie from the previous release come from a source that no longer puts
 * it at this venue?
 *
 * @param {Object} movie - Movie from the previous release
 * @param {Object} attributes - Attributes of the venue being transformed
 * @param {Object} sourcedEvents - This run's source results, keyed by source
 * @returns {boolean} True if the source has this run's data and dropped it here
 */
function isNoLongerSourcedHere(movie, attributes, sourcedEvents) {
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

  return !(sourcedEvents[source.name] ?? []).some(
    (event) => event.showingId === showingId,
  );
}

module.exports = isNoLongerSourcedHere;
