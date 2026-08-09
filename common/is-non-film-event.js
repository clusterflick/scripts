const { basicNormalize } = require("./utils");

const nonFilmEvents = [
  /Community Pilates/i,
  /Bearpit Karaoke/i,
  /Paint your own/i,
  /WEEKND FANPARK/i,
  /Bioimage Analysis/i,
  /Business Networking/i,
  /Healthcare & Wellness/i,
  /Performance Networking/i,
  /Networking Night/i,
  /Networking Reception/i,
  /Interior Design Networking/i,
  /Digital Creatives Networking/i,
  /Medtech Innovation/i,
  /Fashion Business/i,
  /Thursday Third Space/i,
  /Free Salsa/i,
  /Cabin Air Conference/i,
  /Connected Intelligence/i,
  /Annual Meeting/i,
];

const isNonFilmEvent = ({ title }) =>
  nonFilmEvents.some((pattern) => basicNormalize(title).match(pattern));

const isNotNonFilmEvent = (event) => !isNonFilmEvent(event);

module.exports = {
  isNonFilmEvent,
  isNotNonFilmEvent,
};
