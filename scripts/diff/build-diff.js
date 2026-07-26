/**
 * Whether a venue diff is worth reporting at all. Mirrors the set of changes
 * the summary counts: a venue that only shifted a showtime by a few minutes
 * (a sub-tolerance reschedule) has not meaningfully changed.
 *
 * @param {object} venueDiff - A single venue's diff from compareVenue
 * @returns {boolean}
 */
function hasChanges(venueDiff) {
  if (venueDiff.venueAdded || venueDiff.venueRemoved || venueDiff.venueEmpty) {
    return true;
  }
  const { showings, tmdbChanges } = venueDiff;
  return (
    showings.added.length > 0 ||
    showings.removed.length > 0 ||
    showings.modified.length > 0 ||
    tmdbChanges.length > 0
  );
}

/**
 * Roll every venue's diff up into release-wide totals.
 *
 * @param {object} allVenueDiffs - Venue id -> venue diff
 * @returns {object} Totals across the whole comparison
 */
function computeSummary(allVenueDiffs) {
  let totalVenues = 0;
  let venuesAdded = 0;
  let venuesRemoved = 0;
  let venuesEmpty = 0;
  let totalShowingsAdded = 0;
  let totalShowingsRemoved = 0;
  let totalFuturePerfsAdded = 0;
  let totalFuturePerfsRemoved = 0;
  let tmdbGained = 0;
  let tmdbLost = 0;
  let tmdbChanged = 0;

  for (const diff of Object.values(allVenueDiffs)) {
    totalVenues++;

    if (diff.venueAdded) {
      venuesAdded++;
      continue;
    }
    if (diff.venueRemoved) {
      venuesRemoved++;
      continue;
    }
    if (diff.venueEmpty) venuesEmpty++;

    totalShowingsAdded += diff.showings.added.length;
    totalShowingsRemoved += diff.showings.removed.length;
    totalFuturePerfsAdded += diff.futurePerformances.added;
    totalFuturePerfsRemoved += diff.futurePerformances.removed;

    for (const tc of diff.tmdbChanges) {
      if (tc.single) {
        if (tc.single.type === "gained") tmdbGained++;
        else if (tc.single.type === "lost") tmdbLost++;
        else if (tc.single.type === "changed") tmdbChanged++;
      }
      if (tc.multiple) {
        if (tc.multiple.type === "gained") tmdbGained++;
        else if (tc.multiple.type === "lost") tmdbLost++;
        else if (tc.multiple.type === "changed") tmdbChanged++;
      }
    }
  }

  return {
    totalVenues,
    venuesAdded,
    venuesRemoved,
    venuesEmpty,
    showingsAdded: totalShowingsAdded,
    showingsRemoved: totalShowingsRemoved,
    futurePerformancesAdded: totalFuturePerfsAdded,
    futurePerformancesRemoved: totalFuturePerfsRemoved,
    tmdbMatchesGained: tmdbGained,
    tmdbMatchesLost: tmdbLost,
    tmdbMatchesChanged: tmdbChanged,
  };
}

/**
 * Reduce a full comparison to the blob published to data-diffed: venues that
 * did not change are dropped, and TMDB changes are grouped by type so a
 * consumer can pick out gains without walking every entry.
 *
 * Returns null when nothing changed anywhere, so callers can skip publishing.
 *
 * @param {object} comparison - The result of compareReleases
 * @returns {object|null}
 */
function buildPublishedDiff({ metadata, summary, venues }) {
  const changedVenues = {};

  for (const [venueId, diff] of Object.entries(venues)) {
    if (!hasChanges(diff)) continue;

    const tmdbByType = { gained: [], lost: [], changed: [] };
    for (const tc of diff.tmdbChanges) {
      if (tc.single) tmdbByType[tc.single.type].push(tc);
      if (tc.multiple) tmdbByType[tc.multiple.type].push(tc);
    }

    changedVenues[venueId] = {
      name: diff.name,
      venueAdded: diff.venueAdded,
      venueRemoved: diff.venueRemoved,
      venueEmpty: diff.venueEmpty,
      showings: diff.showings,
      futurePerformances: diff.futurePerformances,
      tmdbChanges: tmdbByType,
    };
  }

  if (Object.keys(changedVenues).length === 0) return null;

  return { metadata, summary, venues: changedVenues };
}

module.exports = {
  hasChanges,
  computeSummary,
  buildPublishedDiff,
};
