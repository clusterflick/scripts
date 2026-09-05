const { basicNormalize } = require("./utils");

const nonFilmEvents = [
  /Community Pilates/i,
  /Bearpit Karaoke/i,
  /Paint your own/i,
  // Anchored: a venue billing a painting session after a film or director
  // ("David Lynch Sip and Paint") is still listing that film, so only the
  // listing that is nothing but the painting event is a non-film event.
  /^Sip and Paint/i,
  /WEEKND FANPARK/i,
  /Bioimage Analysis/i,
  /Business Networking/i,
  /Leaders Networking/i,
  /Healthcare & Wellness/i,
  /Performance Networking/i,
  /Networking Night/i,
  /Networking Reception/i,
  /Networking Event:/i,
  /Interior Design Networking/i,
  /Digital Creatives Networking/i,
  /Medtech Innovation/i,
  /Medical Connections/i,
  /Fashion Business/i,
  /Thursday Third Space/i,
  /Free Salsa/i,
  /Cabin Air Conference/i,
  /Connected Intelligence/i,
  /Annual Meeting/i,
  /cancer research symposium/i,
  /Thrift Event/i,
  /Smithsonian Starstruck/i,
  /Neon Naked Life Drawing/i,
  /Homelessness Research/i,
  /Office Management Show/i,
  /Raver Tots Wembley/i,
  /Photography Workshop/i,
  /Adtech Networking/i,
  /Entrepreneurs Meetup/i,
  // The matrimonial series runs under a different community each time
  // ("BENGALI MUSLIM MARRIAGE EVENT", "BLACK & AFRICAN MUSLIM MARRIAGE"),
  // so match the singles-meetup billing they all share rather than
  // carrying a pattern per community.
  /1-to-1 Single .+ Meetup/i,
  /Dinner Reservation/i,
  /Conferencing \d+ Hour/i,
  // The end-of-term recital a singing course puts on, billed by the course
  // rather than by the venue. "singing" is kept in the pattern because a
  // filmmaking course's showcase is a screening of the films it made.
  /singing course showcase/i,
  /R&B THURSDAYS/i,
  // Only the billed-as-a-gig phrasing - a film screened "with live orchestra"
  // or with a live score is still a film.
  /Live Concert/i,
];

const isNonFilmEvent = ({ title }) =>
  nonFilmEvents.some((pattern) => basicNormalize(title).match(pattern));

const isNotNonFilmEvent = (event) => !isNonFilmEvent(event);

module.exports = {
  isNonFilmEvent,
  isNotNonFilmEvent,
};
