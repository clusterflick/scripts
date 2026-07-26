const {
  RESCHEDULE_TOLERANCE_MS,
  matchPerformances,
} = require("./match-performances");
const compareTmdbMatch = require("./compare-tmdb-match");

/**
 * Only performances still to come are worth reporting — a screening that has
 * already happened dropping out of a release is expected, not a change.
 */
function getFuturePerformances(showing, asOf) {
  return (showing.performances || []).filter(({ time }) => time > asOf);
}

// Enough of a movie match to render a feed entry without joining against the
// combined release; the full TMDB record lives there.
const summariseTmdb = ({ id, title, releaseDate }) => ({
  id,
  title,
  releaseDate,
});

// The fields a consumer needs to describe a showing on its own: what it is,
// where to read more, and what it was matched to.
function describeShowing(showing) {
  const description = {
    showingId: showing.showingId,
    title: showing.title,
    url: showing.url,
    category: showing.category,
  };
  if (typeof showing.seen === "number") description.seen = showing.seen;
  if (showing.themoviedb) {
    description.themoviedb = summariseTmdb(showing.themoviedb);
  }
  if (showing.themoviedbs) {
    description.themoviedbs = showing.themoviedbs.map(summariseTmdb);
  }
  return description;
}

/**
 * Compare a single venue's showings between two releases.
 *
 * @param {Array<object>} latestShowings - Showings in the current release
 * @param {Array<object>} previousShowings - Showings in the previous release
 * @param {number} asOf - The instant the comparison is anchored to; performances
 *   after it are still to come. Never the wall clock — see compareReleases.
 * @returns {object} The venue's showing, performance and TMDB changes
 */
function compareVenue(latestShowings, previousShowings, asOf) {
  const latestById = new Map();
  for (const s of latestShowings) latestById.set(s.showingId, s);

  const previousById = new Map();
  for (const s of previousShowings) previousById.set(s.showingId, s);

  const addedShowings = [];
  const removedShowings = [];
  const modifiedShowings = [];
  const tmdbChanges = [];

  let totalFuturePerfsAdded = 0;
  let totalFuturePerfsRemoved = 0;
  let totalRescheduled = 0;

  // Removed showings (in previous, not in latest)
  for (const [showingId, prev] of previousById) {
    if (latestById.has(showingId)) continue;

    const futurePerfs = getFuturePerformances(prev, asOf);
    // Only report removals that had future performances
    if (futurePerfs.length > 0) {
      const sorted = [...futurePerfs].sort((a, b) => a.time - b.time);
      removedShowings.push({
        ...describeShowing(prev),
        futurePerformanceCount: futurePerfs.length,
        nextPerformance: sorted[0].time,
      });
      totalFuturePerfsRemoved += futurePerfs.length;
    }
  }

  // Added showings (in latest, not in previous)
  for (const [showingId, curr] of latestById) {
    if (previousById.has(showingId)) continue;

    const futurePerfs = getFuturePerformances(curr, asOf);
    const sorted = [...futurePerfs].sort((a, b) => a.time - b.time);
    addedShowings.push({
      ...describeShowing(curr),
      futurePerformanceCount: futurePerfs.length,
      nextPerformance: sorted[0]?.time || null,
      performances: sorted.map(({ time }) => time),
    });
  }

  // Modified showings (present in both)
  for (const [showingId, curr] of latestById) {
    const prev = previousById.get(showingId);
    if (!prev) continue;

    const currFuture = getFuturePerformances(curr, asOf);
    const prevFuture = getFuturePerformances(prev, asOf);
    const perfDiff = matchPerformances(currFuture, prevFuture);

    const metadata = {};
    if (curr.title !== prev.title) {
      metadata.titleChanged = { from: prev.title, to: curr.title };
    }
    if (curr.url !== prev.url) {
      metadata.urlChanged = { from: prev.url, to: curr.url };
    }
    if (curr.category !== prev.category) {
      metadata.categoryChanged = { from: prev.category, to: curr.category };
    }

    const tmdbDiff = compareTmdbMatch(curr, prev);
    if (tmdbDiff.single !== null || tmdbDiff.multiple !== null) {
      tmdbChanges.push({
        showingId,
        title: curr.title,
        category: curr.category,
        ...tmdbDiff,
      });
    }

    const hasMetadataChanges = Object.keys(metadata).length > 0;
    const hasPerfChanges =
      perfDiff.added.length > 0 || perfDiff.removed.length > 0;
    const hasSignificantReschedules = perfDiff.rescheduled.some(
      (m) => Math.abs(m.timeDelta) >= RESCHEDULE_TOLERANCE_MS,
    );

    if (hasMetadataChanges || hasPerfChanges || hasSignificantReschedules) {
      modifiedShowings.push({
        ...describeShowing(curr),
        metadata,
        performances: {
          previousCount: prevFuture.length,
          currentCount: currFuture.length,
          added: perfDiff.added.map((p) => p.time),
          removed: perfDiff.removed.map((p) => p.time),
          rescheduled: perfDiff.rescheduled.length,
        },
      });
    }

    totalFuturePerfsAdded += perfDiff.added.length;
    totalFuturePerfsRemoved += perfDiff.removed.length;
    totalRescheduled += perfDiff.rescheduled.length;
  }

  // Sort removed showings by impact (most future performances first)
  removedShowings.sort(
    (a, b) => b.futurePerformanceCount - a.futurePerformanceCount,
  );

  // Count totals for the previous release (for percentage calculations)
  let previousFutureTotal = 0;
  for (const prev of previousById.values()) {
    previousFutureTotal += getFuturePerformances(prev, asOf).length;
  }

  return {
    showings: {
      added: addedShowings,
      removed: removedShowings,
      modified: modifiedShowings,
    },
    futurePerformances: {
      previousTotal: previousFutureTotal,
      added: totalFuturePerfsAdded,
      removed: totalFuturePerfsRemoved,
      rescheduled: totalRescheduled,
    },
    tmdbChanges,
  };
}

module.exports = {
  getFuturePerformances,
  compareVenue,
};
