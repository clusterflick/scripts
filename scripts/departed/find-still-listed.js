/**
 * Index the live listings that carry no TheMovieDB match, keyed by normalised
 * title.
 *
 * A movie can leave the transformed output for two very different reasons: it
 * genuinely stopped being listed, or it is still listed and lost its TheMovieDB
 * match. The second happens when the LLM matches a title one run and not the
 * next, and it leaves a departed page insisting a film is not showing while it
 * is on sale. This index is what lets that page say "were you looking for
 * this?" and point at the listing instead of dead-ending.
 *
 * Only unmatched listings are indexed. A *matched* live movie sharing a
 * normalised title is a different film with the same name - the 1927 and 2001
 * Metropolis, four Beauty and the Beasts - and pointing a reader at one of
 * those would be worse than saying nothing.
 *
 * Titles claimed by more than one unmatched listing are dropped rather than
 * guessed between.
 *
 * @param {Object<string, object>} movies - The combined data's movies
 * @returns {Map<string, {id: string, title: string}>} Normalised title -> listing
 */
function indexUnmatchedByTitle(movies) {
  const index = new Map();
  const ambiguous = new Set();

  for (const [id, movie] of Object.entries(movies)) {
    if (!movie.isUnmatched) continue;
    if (!movie.normalizedTitle) continue;

    if (index.has(movie.normalizedTitle)) {
      ambiguous.add(movie.normalizedTitle);
      continue;
    }
    index.set(movie.normalizedTitle, { id, title: movie.title });
  }

  for (const title of ambiguous) index.delete(title);

  return index;
}

module.exports = { indexUnmatchedByTitle };
