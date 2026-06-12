const { isNotSportShowing } = require("../../common/is-sport-showing");
const { basicNormalize } = require("../utils");

const nonFilmEvents = [/Community Pilates/i, /Bearpit Karaoke/i];

const isNotNonFilmEvent = ({ title }) =>
  !nonFilmEvents.some((nonFilm) => basicNormalize(title).match(nonFilm));

async function transform(data, sourcedEvents) {
  // Return the sourced events for this venue
  return Object.values(sourcedEvents)
    .flatMap((events) => events)
    .filter(isNotSportShowing) // Remove all the football match screenings
    .filter(isNotNonFilmEvent); // Remove all non film events
}

module.exports = transform;
