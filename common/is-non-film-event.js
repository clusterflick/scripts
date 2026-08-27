const { basicNormalize } = require("./utils");

const nonFilmEvents = [
  /Community Pilates/i,
  /Bearpit Karaoke/i,
  /Paint your own/i,
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
  /Dinner Reservation/i,
  /Conferencing \d+ Hour/i,
  /R&B THURSDAYS/i,
];

const isNonFilmEvent = ({ title }) =>
  nonFilmEvents.some((pattern) => basicNormalize(title).match(pattern));

const isNotNonFilmEvent = (event) => !isNonFilmEvent(event);

module.exports = {
  isNonFilmEvent,
  isNotNonFilmEvent,
};
