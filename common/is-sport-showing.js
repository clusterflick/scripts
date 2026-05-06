const { basicNormalize } = require("./utils");

const sportShowings = [
  /\s+Cup(\s+\S+)?\s+Screening$/i,
  /\s+League Screening$/i,
  /\s+Champions League\s+/i,
  /Union Jack Classic/i,
  /Super Bowl/i,
  /Six Nations/i,
  /AFCON\s+/i,
  /GRAND PRIX:/i,
  /^\w+\s+FANPARK:/i,
  /WORLD CUP FINAL/i,
  /WORLD CUP QUALIFIER/i,
  /FIFA Club World/i,
  /FIFA CWC/i,
  /NON-LEAGUE FINAL/i,
  /WORLD CUP 202\d/i,
  /World Cup Live/i,
  /TROPHY FINAL/i,
  /NON-LEAGUE FINALS/i,
  /Wimbledon Live/i,
];

const isSportShowing = ({ title }) =>
  sportShowings.some((pattern) => basicNormalize(title).match(pattern));

const isNotSportShowing = (event) => !isSportShowing(event);

module.exports = {
  isSportShowing,
  isNotSportShowing,
};
