// Data from https://independentcinemaoffice.org.uk/
const path = require("node:path");
const { readJSON } = require("../common/utils");
const distanceInKmBetweenCoordinates = require("../common/distance-in-km-between-coordinates");
const getModuleNamesFor = require("../common/get-module-names-for");
const { isInLondon } = require("./utils");

const cinemasPath = path.join(__dirname, "..", "cinemas");

const nonMatchStatus = {
  // Add any known closed or excluded venues here
};

async function findCinemasIndependentCinemaOffice() {
  const cinemaNames = await getModuleNamesFor(cinemasPath);
  const cinemas = cinemaNames.map((cinemaName) =>
    require(path.join(cinemasPath, cinemaName)),
  );

  const data = await readJSON(
    path.resolve(__dirname, "./independentcinemaoffice.json"),
  );
  let count = 0;
  const missingCoordinates = [];

  for (const { content, position } of data) {
    const name = content?.title;
    const link = content?.link;

    if (!name) continue;
    if (!position?.lat || !position?.lng) {
      missingCoordinates.push({ name, link });
      continue;
    }

    const location = { lat: position.lat, lon: position.lng };

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

  if (missingCoordinates.length > 0) {
    console.log();
    console.log("=".repeat(50));
    console.log(`Venues missing coordinates (${missingCoordinates.length}):`);
    console.log("=".repeat(50));
    missingCoordinates.forEach(({ name, link }) => {
      console.log(`- ${name} [${link ? link : "No link"}]`);
    });
  }
}

findCinemasIndependentCinemaOffice();
