// A listing that bills itself as a short film - "Saddled - Short Film - UK
// Première", "The Breath of Bones | Short Film | Premiere", "Climate Justice
// Short Film Screening" - has that said in the part of the title
// normalizeTitle strips, so the matcher only ever sees the bare name. Where
// TheMovieDB holds one released film of that name and the listing names no
// director, getBestMatch takes it on the title alone, and a short that isn't on
// TheMovieDB is matched to whatever feature shares its name: on 27 November
// 2026 Ruben Giovannoni's debut short "Saddled" at ArtHouse Crouch End was
// matched to Brian Kamerer's 86-minute "Saddled" (2023).
//
// The test is for the marker describing what is being shown, so three kinds of
// title are left out:
//  - one whose normalized title still carries it: the words are the film's
//    name ("A Short Film About Killing"), or normalizeTitle has kept them as
//    the name of the event ("Short Film Competition").
//  - one where the short is the extra item on a bill - "Pink Narcissus + WOFFF
//    Short Film", "2046 plus Short Film", "with short film". The feature is
//    what is being matched.
//  - one where the marker names a festival or competition the listing belongs
//    to rather than the film - "Tibet Film Festival London Short Film
//    Competition and UK Premiere of My Sweet Pala" is premiering a feature.
// Each exclusion leaves a listing matched as it is today; a wrong inclusion
// would rule out a correct match, so the exclusions are allowed to run wide.
const MARKER = /short[\s-]*films?/i;
// The guard can only go wrong where the title normalises to the feature's name
// while the marker is about something shown alongside it, so any wording that
// attaches a short to the bill counts. A "+", "plus" or "preceded by" anywhere
// before the marker ("+ Kate Bush Short Film", "preceded by Jo's short film"),
// but "with", "and" and "&" only directly before it - "Burnt Toast with
// Marmite: Short Film Premiere" is the short's own name.
const MARKER_AS_EXTRA = new RegExp(
  [
    String.raw`(\+|\bplus\b|\b(preceded|followed|accompanied|supported)\s+by\b|\balongside\b|\bpaired\s+with\b)[^+]*?short[\s-]*films?`,
    String.raw`(\bwith|\band|&)\s+(an?\s+|the\s+)?short[\s-]*films?`,
  ].join("|"),
  "i",
);
const MARKER_AS_EVENT_NAME = /short[\s-]*films?\s+(festival|competition)/i;

/**
 * Does this listing say what it is showing is a short film?
 * @param {string} title - The listing's title, as the venue gives it
 * @param {string} normalizedTitle - The same title through normalizeTitle
 * @returns {boolean}
 */
const isBilledAsShortFilm = (title, normalizedTitle) =>
  MARKER.test(title) &&
  !MARKER.test(normalizedTitle) &&
  !MARKER_AS_EXTRA.test(title) &&
  !MARKER_AS_EVENT_NAME.test(title);

module.exports = isBilledAsShortFilm;
