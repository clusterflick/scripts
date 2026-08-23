/**
 * Serials - TV series, and long films screened over several sittings - get
 * listed as one event per block, with the block named in brackets:
 * "La maison des bois (Episodes 4 and 5)", "The Journey (Parts 1 to 4)".
 *
 * Those all normalize to the same title, so combining gathers every block into
 * a single film. The container then keeps the shortest member's title, which
 * names one block while listing the showings for all of them. Stripping the
 * block leaves a title that's true of everything underneath it; the specific
 * block survives on each showing, which is what the performance cards display.
 */

// Episode brackets are always a venue's description of what's being screened,
// never part of what the thing is called, so any of them can go.
const episodeBlock = /\s*\((?:episodes?|eps?)\s*\d[^)]*\)/gi;

// Parts are different: "(Part 1)" can be the film's actual title, as in
// "Kaamelott: The Second Chapter (Part 1)". Only a run of them - a range or a
// list - describes a sitting rather than names a film.
const partBlock = /\s*\(parts?\s*\d+\s*(?:[-–—]|to|,|&|and)\s*\d[^)]*\)/gi;

function stripSerialBlockSuffix(title = "") {
  return title
    .replace(episodeBlock, "")
    .replace(partBlock, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—:+]\s*$/, "")
    .trim();
}

module.exports = stripSerialBlockSuffix;
