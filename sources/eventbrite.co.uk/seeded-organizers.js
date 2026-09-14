// Organisers asked for by name rather than found.
//
// The sweep in retrieve.js can only ask organisers whose id arrived on a search
// result, so an organiser the search omits entirely is one no widening of it
// reaches. Their events are filtered by title and venue like anyone else's -
// being named here buys a hearing, not a place in the output - and cost a
// request per run each.
//
// Every entry says who it is, because an id nobody can attribute is one nobody
// can ever remove.
module.exports = [
  // Erotic Film Festival London, at Coldharbour Blue and The Bath House.
  // https://www.eventbrite.co.uk/o/erotic-film-festival-london-114851363951
  // Absent from the search (checked 2026-09-14) despite being live, public and
  // categorised Film & Media -> Film -> Screening.
  "114851363951",
];
