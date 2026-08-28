const { getExpectedClosure } = require("../../common/expected-closures");

// What a declared closure can account for. A chain drops a shut venue from its
// own site list as readily as it empties its listings - Vue delisted Finchley
// Road from `/showings/cinemas` at midnight on the first day of its
// refurbishment, an hour after its last performance played out - and both are
// the source telling the truth about the venue rather than a breakage.
//
// Nothing else is excused. A challenge, a holding page, or a probe that
// couldn't complete says nothing about whether the doors are open, and a
// closure is no reason to stop noticing them.
const CLOSURE_EXPLAINS = new Set(["unknown-venue-id", "no-listings-found"]);

/**
 * Re-label a row whose failure a declared closure already accounts for.
 *
 * The pipeline already stands down for these venues - `transform` returns
 * nothing rather than throwing when a closed venue's listings come back empty -
 * but the probe looks harder than the pipeline does: it asks the chain's own
 * site list whether the venue exists at all, which is the check that tells a
 * venue with nothing on from an id that has gone stale. A closed venue fails
 * that check for the length of its closure, so without this the stage goes red
 * every cycle for a week over something already written down and deliberately
 * tolerated - and a week of expected red is a week in which a real Vue
 * breakage looks exactly the same.
 *
 * The observation itself is never discarded. The row keeps what the probe
 * actually saw under `observed` and names the closure it is standing down for,
 * so the log still says the venue was missing from the chain list - it just
 * stops calling it our bug.
 *
 * Judged against the row's own timestamp rather than the clock, so a row means
 * the same thing whenever it is read back.
 *
 * @param {object} row - One finalised probe row
 * @returns {object} The row, with an explained failure re-labelled
 */
function standDownForClosure(row) {
  if (!row.reason || !CLOSURE_EXPLAINS.has(row.reason.kind)) return row;

  const closure = getExpectedClosure(row.venue, new Date(row.at));
  if (!closure) return row;

  return {
    ...row,
    reason: {
      kind: "expected-closure",
      observed: row.reason.kind,
      until: closure.until,
      closedFor: closure.reason,
    },
  };
}

module.exports = standDownForClosure;
module.exports.CLOSURE_EXPLAINS = CLOSURE_EXPLAINS;
