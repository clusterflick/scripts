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
  /FA CUP QUALIFIER/i,
  /FA CUP FINAL/i,
  /CONFERENCE LEAGUE QUALIFIER/i,
  /CONFERENCE LEAGUE FINAL/i,
  /EUROPA LEAGUE QUALIFIER/i,
  /EUROPA LEAGUE FINAL/i,
  /Enterprise National League/i,
  /FINALS WORLD CUP/i,
  /Fifa World Cup/i,
  /FIFA Club World/i,
  /FIFA CWC/i,
  /NON-LEAGUE FINALS?/i,
  /WORLD CUP 202\d/i,
  /World Cup Live/i,
  /WORLD CUP FAN/i,
  /World Cup: /i,
  /World Cup\s?- /i,
  /World Cup Match/i,
  /TROPHY FINAL/i,
  /Wimbledon Live/i,
  /Wimbledon Finals/i,
  /PLAYOFF FINAL/i,
  /BIG SCREEN FOOTBALL/i,
];

const isSportShowing = ({ title }) =>
  sportShowings.some((pattern) => basicNormalize(title).match(pattern));

const isNotSportShowing = (event) => !isSportShowing(event);

module.exports = {
  isSportShowing,
  isNotSportShowing,
};
