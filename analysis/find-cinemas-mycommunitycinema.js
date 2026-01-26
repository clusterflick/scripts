// Data from https://mycommunitycinema.org.uk/
const path = require("node:path");
const { readJSON } = require("../common/utils");
const distanceInKmBetweenCoordinates = require("../common/distance-in-km-between-coordinates");
const getModuleNamesFor = require("../common/get-module-names-for");
const { isInLondon } = require("./utils");

const cinemasPath = path.join(__dirname, "..", "cinemas");

const nonMatchStatus = {
  // Add any known closed or excluded venues here
};

async function findCinemasMyCommunity() {
  const cinemaNames = await getModuleNamesFor(cinemasPath);
  const cinemas = cinemaNames.map((cinemaName) =>
    require(path.join(cinemasPath, cinemaName)),
  );

  const data = await readJSON(
    path.resolve(__dirname, "./mycommunitycinema.json"),
  );
  let count = 0;

  for (const { name, lat, lng, link } of data.cinemas) {
    if (!name) continue;
    if (!lat || !lng) {
      console.warn(`${name} missing coordinates`);
      continue;
    }

    const location = { lat: parseFloat(lat), lon: parseFloat(lng) };

    if (!(await isInLondon(location.lat, location.lon))) {
      continue;
    }

    const cinemaDistances = cinemas
      .map(({ attributes: cinema }) => {
        const distance = distanceInKmBetweenCoordinates(cinema.geo, location);
        return { distance, name: cinema.name };
      })
      .sort((a, b) => a.distance - b.distance);

    const closest = cinemaDistances[0];
    if (closest.distance <= 0.1) {
      continue;
    } else {
      if (nonMatchStatus[name]) continue;

      count++;
      console.log(
        `${count}. Review cinema "${name}" [${link ? link : "No link"}]`,
      );
      console.log(
        ` - Closest match is "${closest.name}", ${Math.round(closest.distance * 1000)}m away`,
      );
      console.log();
    }
  }

  console.log(`Total new cinemas to review: ${count}`);
}

findCinemasMyCommunity();
