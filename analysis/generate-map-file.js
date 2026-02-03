const path = require("node:path");
const fs = require("node:fs");
const { toKML } = require("@placemarkio/tokml");
const { readJSON } = require("../common/utils");
const { getAllCinemaNames, getCinemaAttributes } = require("../cinemas");

const outPath = "./map.kml";

function buildKml(boundary, points) {
  const mapPoints = {
    type: "FeatureCollection",
    features: points.map(({ name, lon, lat }) => {
      return {
        type: "Feature",
        properties: { name },
        geometry: { type: "Point", coordinates: [lon, lat] },
      };
    }),
  };

  return toKML({
    type: "FeatureCollection",
    features: [
      ...(boundary.type === "FeatureCollection"
        ? boundary.features
        : [boundary]),
      ...mapPoints.features,
    ],
  });
}

async function generateMap() {
  const boundary = await readJSON(
    path.resolve(__dirname, "./London_GLA_Boundary.geojson"),
  );
  const cinemaNames = getAllCinemaNames();
  const points = cinemaNames.map((cinema) => {
    const attributes = getCinemaAttributes(cinema);
    return {
      ...attributes.geo,
      name: attributes.name,
    };
  });

  const kml = buildKml(boundary, points);
  fs.writeFileSync(outPath, kml, "utf8");
}

generateMap();
