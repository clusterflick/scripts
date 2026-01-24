const { basicNormalize } = require("../../common/utils");

const sportShowings = [
  /\s+Cup Screening$/i,
  /\s+League Screening$/i,
  /Union Jack Classic/i,
  /Super Bowl/i,
  /Six Nations/i,
  /AFCON\s+/i,
  /GRAND PRIX:/i,
  /^\w+\s+FANPARK:/i,
];

const nonFilmEvents = [/Community Pilates/i];

const isNotSportShowing = ({ title }) =>
  !sportShowings.some((sports) => basicNormalize(title).match(sports));

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
