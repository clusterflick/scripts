const { basicNormalize } = require("../../common/utils");

const sportShowings = [
  /\s+Cup Screening$/i,
  /\s+League Screening$/i,
  /Union Jack Classic/i,
  /Super Bowl/i,
  /Six Nations/i,
  /AFCON\s+/i,
];

const isNotSportShowing = ({ title }) =>
  !sportShowings.some((sports) => basicNormalize(title).match(sports));

async function transform(data, sourcedEvents) {
  // Return the sourced events for this venue
  return Object.values(sourcedEvents)
    .flatMap((events) => events)
    .filter(isNotSportShowing); // Remove all the football match screenings
}

module.exports = transform;
