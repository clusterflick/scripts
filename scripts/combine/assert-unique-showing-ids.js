/**
 * A showingId identifies one screening at one venue. Source modules build it
 * from the *source's* id rather than the venue's - "eventbrite.co.uk-1997687300492"
 * - so an event that matches two venues produces the same id twice. Combine
 * keys showings by that id and concatenates performances, which quietly turns
 * the double match into one venue showing the same performance twice.
 *
 * There is no correct way to split a collision here: we can't tell which venue
 * the event is actually at, so we fail rather than publish a listing attributed
 * to the wrong place.
 *
 * @param {Object} data - Loaded transform output, keyed by cinema name
 * @throws {Error} If any showingId is claimed by more than one movie or venue
 */
function assertUniqueShowingIds(data) {
  const claims = new Map();

  for (const cinema of Object.keys(data)) {
    for (const { showingId } of data[cinema].movies) {
      if (!claims.has(showingId)) claims.set(showingId, []);
      claims.get(showingId).push(cinema);
    }
  }

  const collisions = [...claims].filter(([, cinemas]) => cinemas.length > 1);
  if (collisions.length === 0) return;

  const detail = collisions
    .map(([showingId, cinemas]) => `  ${showingId} -> ${cinemas.join(", ")}`)
    .join("\n");

  throw new Error(
    `Showing id claimed by more than one venue:\n${detail}\n` +
      "Two venues matched the same sourced event, most likely because they " +
      "share a name the source matches on and sit close enough together for " +
      "the distance check to pass. Fix the venue attributes so only one of " +
      "them matches.",
  );
}

module.exports = assertUniqueShowingIds;
