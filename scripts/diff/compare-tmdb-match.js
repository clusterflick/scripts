/**
 * Compare the movie matches on a showing across two releases. Handles both the
 * single-movie match (`themoviedb`) and the multiple-movies match
 * (`themoviedbs`); a showing can carry either, so each is reported separately
 * and is null when unchanged.
 *
 * @param {object} latestShowing - The showing in the current release
 * @param {object} previousShowing - The same showing in the previous release
 * @returns {{ single: object|null, multiple: object|null }}
 */
function compareTmdbMatch(latestShowing, previousShowing) {
  const result = { single: null, multiple: null };

  // Single movie match
  const prevTmdb = previousShowing.themoviedb;
  const currTmdb = latestShowing.themoviedb;

  if (!prevTmdb && currTmdb) {
    result.single = { type: "gained", current: currTmdb };
  } else if (prevTmdb && !currTmdb) {
    result.single = { type: "lost", previous: prevTmdb };
  } else if (prevTmdb && currTmdb && prevTmdb.id !== currTmdb.id) {
    result.single = {
      type: "changed",
      previous: prevTmdb,
      current: currTmdb,
    };
  }

  // Multiple movies match
  const prevTmdbs = previousShowing.themoviedbs || [];
  const currTmdbs = latestShowing.themoviedbs || [];
  const prevIds = new Set(prevTmdbs.map((t) => t.id));
  const currIds = new Set(currTmdbs.map((t) => t.id));

  const addedEntries = currTmdbs.filter((t) => !prevIds.has(t.id));
  const removedEntries = prevTmdbs.filter((t) => !currIds.has(t.id));

  if (prevTmdbs.length === 0 && currTmdbs.length > 0) {
    result.multiple = { type: "gained", current: currTmdbs };
  } else if (prevTmdbs.length > 0 && currTmdbs.length === 0) {
    result.multiple = { type: "lost", previous: prevTmdbs };
  } else if (addedEntries.length > 0 || removedEntries.length > 0) {
    result.multiple = {
      type: "changed",
      added: addedEntries,
      removed: removedEntries,
    };
  }

  return result;
}

module.exports = compareTmdbMatch;
