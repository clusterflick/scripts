// A source's match can break without anything failing. When Rotten Tomatoes
// renamed its scorecard's `score` to `scorePercent` in November 2026, every
// film still matched - 1,138 of them - and every one was published with a null
// score, which the website reads as no rating at all. It went on for days.
//
// So a match run is checked for the two outcomes a working source never
// produces: nothing matched at all, or matches that carry nothing to show.
// Normally 75-100% of a source's matches carry their score (some films are too
// new or too obscure to have one), so none at all means the reading broke, not
// that the films lack scores.
//
// Only the all-or-nothing case throws. A partial fall is a trend, and is
// followed release by release on manage.clusterflick.com.

const isNumber = (value) => typeof value === "number" && !Number.isNaN(value);

// The figure the website shows for each source - the one a match exists for.
const SCORE_OF = {
  bechdel: (match) => match.rating,
  imdb: (match) => match.rating,
  letterboxd: (match) => match.rating,
  metacritic: (match) => match.critics?.rating,
  moviedb: (match) => match.rating,
  rottentomatoes: (match) => match.critics?.all?.score,
};

function checkMatchedData(source, data) {
  const scoreOf = SCORE_OF[source];
  if (!scoreOf) throw new Error(`No score defined for source "${source}"`);

  const matches = Object.values(data);
  if (matches.length === 0) {
    throw new Error(`No movies matched on ${source}`);
  }
  const scored = matches.filter((match) => isNumber(scoreOf(match))).length;
  if (scored === 0) {
    throw new Error(
      `None of the ${matches.length} movies matched on ${source} has a score - has the source changed shape?`,
    );
  }
  return { matched: matches.length, scored };
}

module.exports = checkMatchedData;
