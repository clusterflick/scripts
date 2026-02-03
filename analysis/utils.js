const { isInLondon } = require("../common/geo-utils");
const { getAllCinemaNames, getCinemaAttributes } = require("../cinemas");

function getAttributesFor(venue) {
  return getCinemaAttributes(venue);
}

function getNullMapping(prefix) {
  const cinemas = getAllCinemaNames();
  const filteredCinemas = cinemas.filter((cinema) => cinema.startsWith(prefix));
  return filteredCinemas.reduce(
    (mapping, cinema) => ({ ...mapping, [cinema]: null }),
    {},
  );
}

module.exports = {
  isInLondon,
  getAttributesFor,
  getNullMapping,
};
