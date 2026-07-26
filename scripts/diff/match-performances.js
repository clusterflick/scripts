// A performance whose time moves by less than this is treated as the same
// performance being rescheduled rather than one removed and another added.
const RESCHEDULE_TOLERANCE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Pair up two lists of performances by closest start time, so a shifted
 * showtime reads as a reschedule instead of a removal plus an addition.
 *
 * @param {Array<object>} latestPerfs - Performances in the current release
 * @param {Array<object>} previousPerfs - Performances in the previous release
 * @returns {{ rescheduled: Array<object>, added: Array<object>, removed: Array<object> }}
 */
function matchPerformances(latestPerfs, previousPerfs) {
  const rescheduled = [];
  const added = [];
  const removed = [];

  const usedLatest = new Set();
  const usedPrevious = new Set();

  // For each previous performance, find closest time match in latest
  for (let pi = 0; pi < previousPerfs.length; pi++) {
    const prev = previousPerfs[pi];
    let bestIdx = -1;
    let bestDelta = Infinity;

    for (let li = 0; li < latestPerfs.length; li++) {
      if (usedLatest.has(li)) continue;
      const delta = Math.abs(latestPerfs[li].time - prev.time);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = li;
      }
    }

    if (bestIdx >= 0 && bestDelta <= RESCHEDULE_TOLERANCE_MS) {
      usedLatest.add(bestIdx);
      usedPrevious.add(pi);
      const timeDelta = latestPerfs[bestIdx].time - prev.time;
      if (timeDelta !== 0) {
        rescheduled.push({
          previous: prev,
          latest: latestPerfs[bestIdx],
          timeDelta,
        });
      }
    }
  }

  for (let pi = 0; pi < previousPerfs.length; pi++) {
    if (!usedPrevious.has(pi)) removed.push(previousPerfs[pi]);
  }

  for (let li = 0; li < latestPerfs.length; li++) {
    if (!usedLatest.has(li)) added.push(latestPerfs[li]);
  }

  return { rescheduled, added, removed };
}

module.exports = {
  RESCHEDULE_TOLERANCE_MS,
  matchPerformances,
};
