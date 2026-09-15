// The organisers we ask Clyx about, by slug.
//
// Clyx has no public browse: its feed and explore pages need an account, and
// the only listing the API answers unauthenticated is one organiser's own
// calendar. So unlike a platform we can sweep, nothing here is discovered -
// an organiser absent from this list is an organiser we never see.
//
// Their events are filtered by venue like anyone else's, so being named here
// buys a hearing rather than a place in the output, and costs one request per
// run plus one per upcoming event.
//
// Every entry says who it is, because a slug nobody can attribute is one
// nobody can ever remove.
module.exports = [
  // Coffeehouse Cinema - curated short film screenings followed by a
  // filmmaker Q&A, run out of coffee shops. Mostly Los Angeles ("Vol. N"),
  // and from September 2026 at Mason & Fifth, Westbourne Park in London.
  // https://clyx.com/feed/coffeehouse-cinema-london
  "coffeehouse-cinema",
];
