const path = require("node:path");
const { point, polygon } = require("@turf/helpers");
const { booleanPointInPolygon } = require("@turf/boolean-point-in-polygon");
const { readJSON } = require("../common/utils");
const getModuleNamesFor = require("../common/get-module-names-for");

async function isInLondon(lat, lon) {
  const greaterLondonGeo = await readJSON(
    path.resolve(__dirname, "./London_GLA_Boundary.geojson"),
  );
  const pt = point([lon, lat]);
  const poly = polygon(greaterLondonGeo.features[0].geometry.coordinates);
  return booleanPointInPolygon(pt, poly);
}

function getAttributesFor(venue) {
  const cinemasPath = path.join(__dirname, "..", "cinemas");
  const { attributes } = require(path.join(cinemasPath, venue));
  return attributes;
}

async function getNullMapping(prefix) {
  const cinemasPath = path.join(__dirname, "..", "cinemas");
  const cinemas = await getModuleNamesFor(cinemasPath);
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
