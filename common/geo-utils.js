const path = require("node:path");
const { point, polygon } = require("@turf/helpers");
const { booleanPointInPolygon } = require("@turf/boolean-point-in-polygon");
const { readJSON } = require("./utils");

// Path to the Greater London boundary GeoJSON file
const LONDON_BOUNDARY_PATH = path.resolve(
  __dirname,
  "../data/London_GLA_Boundary.geojson",
);

async function isInLondon(lat, lon) {
  const greaterLondonGeo = await readJSON(LONDON_BOUNDARY_PATH);
  const pt = point([lon, lat]);
  const poly = polygon(greaterLondonGeo.features[0].geometry.coordinates);
  return booleanPointInPolygon(pt, poly);
}

module.exports = {
  isInLondon,
};
