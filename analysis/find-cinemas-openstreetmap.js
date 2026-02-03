// Data from https://overpass-turbo.eu/?q=LyoKVGhpcyBoYcSGYmVlbiBnxI1lcmF0ZWQgYnkgdGhlIG92xJJwxIlzLXR1cmJvIHdpemFyZC7EgsSdxJ9yaWdpbmFsIHNlxLBjaMSsxIk6CsOiwoDCnEFtxI1pdHk9Q8S6ZW1hIMS6IExvbmTFm8WIwp0KKi8KW291dDpqc8WbXVt0acWMxabFqDI1XTsKLy8gZmV0xYIgxLDFgCDFiMKcxZrFnMWewoDCncSbxKvEv8WBxYPEugp7e8SQb2NvZGVBcsWAOkfGm8SUxJLFmcWbxZ1ufX0tPi7GjXLFgsaaxYDFt8W5xI_ElMSdciDGm3N1bHRzCm53clsiYcWMbsWOeSI9ImPFk8WVIl0oxoFhxqrFgMasaMauYSnGsMW6cMS3bnTGtmXGuMa6xrzFssSPZW9tOw&c=BJpq2bTpBJ
const path = require("node:path");
const { readJSON } = require("../common/utils");
const distanceInKmBetweenCoordinates = require("../common/distance-in-km-between-coordinates");
const { getAllCinemaNames, getCinema } = require("../cinemas");

const nonMatchStatus = {
  "Curzon Goldsmiths":
    "Closed -- https://www.newsshopper.co.uk/news/19439437.curzon-goldsmiths-cinema-permanently-closes-public/",
  "Deptford Cinema": "Closed -- http://deptfordcinema.org/",
  "Ealing Project": "Closed -- https://www.ealingproject.co.uk/home",
  "Library & Sidcup Storyteller Cinema":
    "Closed -- https://www.bexley.gov.uk/news/new-chapter-sidcup-storyteller-cinema",
  "Institute Of Light": "Closed -- https://cinematreasures.org/theaters/55418",
};

async function findCinemasOpenStreetMap() {
  const cinemaNames = getAllCinemaNames();
  const cinemas = cinemaNames.map((cinemaName) => getCinema(cinemaName));

  const data = await readJSON(path.resolve(__dirname, "./openstreetmap.json"));
  let count = 0;

  data.elements.forEach(({ tags: { name, website }, lat, lon, geometry }) => {
    if (!name) return;
    if ((!lat || !lon) && !geometry) {
      throw new Error(`${name} missing coordinates`);
    }

    const location = lat && lon ? { lat, lon } : geometry[0];

    const cinemaDistances = cinemas
      .map(({ attributes: cinema }) => {
        const distance = distanceInKmBetweenCoordinates(cinema.geo, location);
        return { distance, name: cinema.name };
      })
      .sort((a, b) => a.distance - b.distance);

    const closest = cinemaDistances[0];
    if (closest.distance <= 0.1) {
      return;
    } else {
      if (nonMatchStatus[name]) return;

      count++;
      console.log(
        `${count}. Review cinema "${name}" [${website ? website : "No website"}]`,
      );
      console.log(
        ` - Closest match is "${closest.name}", ${Math.round(closest.distance * 1000)}m away`,
      );
      console.log();
    }
  });
}

findCinemasOpenStreetMap();
