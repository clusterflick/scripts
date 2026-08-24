const {
  convertNamesTextToList,
  cleanCrewName,
  isHelpfulCrewName,
} = require("../../common/utils");

// The credit is sometimes a line of its own ("Directed by Ali Ray") and
// sometimes the opening clause of a sentence ("Directed by BAFTA nominees Iain
// Forsyth and Jane Pollard, Broken English is a portrait of ..."), so cut at
// the first clause boundary rather than running to the end of the line. A full
// stop only ends the clause when it follows a lower-case letter, so initials
// such as "J.J. Abrams" stay intact.
const clauseBoundary = /,|\s+\/\s+|(?<![A-Z])\.(?=\s|$)|\(/;

function getDirectors(synopsis) {
  const match = synopsis.match(/^directed by\s+(.+)$/im);
  if (!match) return undefined;

  // Every consumer of `crew` treats it as a list of names, so split the credit
  // the same way `createOverview` splits the ones venues provide directly.
  const directors = convertNamesTextToList(match[1].split(clauseBoundary)[0])
    .map(cleanCrewName)
    .filter(isHelpfulCrewName);

  return directors.length > 0 ? directors : undefined;
}

module.exports = getDirectors;
