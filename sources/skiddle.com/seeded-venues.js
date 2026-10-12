// Venues whose whole Skiddle programme is retrieved, not just what it files
// under "Film and Media".
//
// A venue that puts on film among club nights and gigs won't necessarily
// categorise a screening as film - Skiddle has a single event type per listing,
// and a hosted screening is as likely to be filed under "Kids and Family" as
// anywhere. Everything at these venues is retrieved and the venue's own
// transform decides what is a film, so each one should be using
// `common/source-only/film-listings-transform`.
//
// Every entry says who it is, because an id nobody can attribute is one nobody
// can ever remove.
module.exports = [
  // Plaza Camden, 14 Parkway
  // https://www.skiddle.com/whats-on/London/Plaza-Camden/
  142233,
];
