/**
 * Picks which of a group of combined, unmatched listings lends the film its
 * title. The shortest title is usually the plainest - "Paddington in Peru"
 * over "Paddington in Peru + Q&A with director" - but a venue that truncates
 * its titles also produces short ones: "Paddington in Peru + Q&A with..."
 * would win on length while reading as broken on the page.
 *
 * So a title cut off with an ellipsis is only used when every listing in the
 * group is cut off; otherwise the shortest of the whole titles wins.
 */

const isTruncated = (title = "") => /(?:\.{3}|…)\s*$/.test(title);

function selectDisplayMovie(group) {
  const whole = group.filter(({ title }) => !isTruncated(title));
  const candidates = whole.length > 0 ? whole : group;
  return candidates.reduce((selected, challenger) =>
    selected.title.length > challenger.title.length ? challenger : selected,
  );
}

module.exports = selectDisplayMovie;
module.exports.isTruncated = isTruncated;
