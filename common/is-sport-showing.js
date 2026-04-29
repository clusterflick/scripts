const { basicNormalize } = require("./utils");

const sportShowings = [
  /\s+Cup(\s+\S+)?\s+Screening$/i,
  /\s+League Screening$/i,
  /Union Jack Classic/i,
  /Super Bowl/i,
  /Six Nations/i,
  /AFCON\s+/i,
  /GRAND PRIX:/i,
  /^\w+\s+FANPARK:/i,
  /WORLD CUP FINAL/i,
  /WORLD CUP 202\d/i,
  /TROPHY FINAL/i,
];

const isSportShowing = ({ title }) =>
  sportShowings.some((pattern) => basicNormalize(title).match(pattern));

const isNotSportShowing = (event) => !isSportShowing(event);

module.exports = {
  isSportShowing,
  isNotSportShowing,
};
