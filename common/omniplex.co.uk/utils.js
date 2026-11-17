const { format } = require("date-fns");

// The showtimes page renders one date at a time and names the rest in an inline
// `allowedDatesTimestamps` array - the dates this venue actually has listings
// for, not a fixed calendar window: 54 at Sutton and 43 at Wigan the day this
// was written. Both the retrieve and the health probe start from it, so it lives
// here rather than in either.
//
// An empty array is read as an empty array rather than as a missing one: a venue
// with nothing on and a page that has stopped carrying the array are different
// answers, and the health probe records the first and fails on the second.
function extractAllowedDates(html) {
  const match = html.match(/allowedDatesTimestamps\s*=\s*(\[[^\]]*\])/);
  if (!match)
    throw new Error("Could not find allowedDatesTimestamps on showtimes page");
  const timestamps = JSON.parse(match[1]);
  // Timestamps are midnight BST; format() uses TZ=Europe/London (set by pipeline)
  const toDateStr = (ts) => format(new Date(ts), "yyyy-MM-dd");
  return [...new Set(timestamps.map(toDateStr))].sort();
}

// A film's own page carries the director and cast that no showtimes page does,
// so the retrieve fetches it and the transform reads it back, keyed by URL. Both
// build that URL here: two copies that drifted apart would not fail, they would
// quietly look up a key that was never stored.
function getMoviePageUrl(domain, path) {
  return path.startsWith("http") ? path : `${domain}${path}`;
}

// An unrecognised site slug does not 404: the page comes back 200 as the chain's
// own site chooser - "Which is your local Omniplex?" - which is Omniplex
// answering with its site list. That is the check that tells a venue with
// nothing on from an id that has gone stale, so the probe looks for the chooser
// before it looks for listings. A film page asked for without the cinema's
// `sitecode` cookie is the chooser too, which the retrieve checks for.
//
// It is the chooser's *form* that says so, not its items: every page on the site
// carries the same 44 `.site-selection-item` entries in a hidden overlay, and
// only the page that is actually asking wraps them in `#siteList`.
const isSiteChooser = ($) => $("#siteList").length > 0;

// Walk up from the favourite-button img until we find an ancestor that owns
// .showTimeBox descendants. The img is in the info column; showtimes are in a
// sibling column — their first common ancestor is the movie-level inner grid.
function findMovieCard($anchor) {
  let $el = $anchor.parent();
  for (let depth = 0; depth < 10; depth++) {
    if (!$el.length) return null;
    if ($el.find(".showTimeBox").length > 0) return $el;
    $el = $el.parent();
  }
  return null;
}

// Every film card on a showtimes page. The retrieve fetches a film page for
// each card's title link and the transform looks each one up again, so both
// find the cards here: when they found films in different ways - the retrieve
// by scanning for a link pattern - a change to Omniplex's links passed the
// retrieve with no film pages at all and only failed in the transform.
function findMovieCards($) {
  return $('img[id^="favourite"]')
    .toArray()
    .map((el) => findMovieCard($(el)))
    .filter(Boolean);
}

const getMovieCardTitleLink = ($card) => $card.find("p.font-medium a").first();

module.exports = {
  extractAllowedDates,
  findMovieCards,
  getMovieCardTitleLink,
  getMoviePageUrl,
  isSiteChooser,
};
