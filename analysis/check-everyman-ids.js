const slugify = require("slugify");
const {
  fetchText,
  fetchJson,
  sanitizePathSegment,
} = require("../common/utils");
const { isInLondon, getNullMapping, getAttributesFor } = require("./utils");

const prefix = "everymancinema.com-";
const normalize = (value) => value.replace("Everyman ", "").trim();

async function checkEverymanIds() {
  const mainPage = await fetchText("https://www.everymancinema.com/");

  // Extract the CMS hash URL from the main page
  const requestPrefix = mainPage.match(/src="([^"]+)webpack-runtime-/i)[1];
  const pageData = await fetchJson(
    `${requestPrefix}page-data/index/page-data.json`,
  );

  let venueData = null;
  // Run through all page data blobs until we find the ones we want to keep
  for (const hash of pageData.staticQueryHashes) {
    const url = `${requestPrefix}page-data/sq/d/${hash}.json`;
    const data = await fetchJson(url);
    if (data?.data?.allTheater) venueData = data.data.allTheater.nodes;
  }

  const recorded = await getNullMapping(prefix);
  for (let {
    id,
    name,
    practicalInfo: { coordinates },
  } of venueData) {
    name = normalize(name);
    const venue = `${prefix}${sanitizePathSegment(slugify(name))}`;

    if (recorded[venue] === null) {
      const attributes = getAttributesFor(venue);
      recorded[venue] = {
        retrieved: { id, name },
        current: {
          id: attributes.cinemaId,
          name: normalize(attributes.name),
        },
      };
    } else if (await isInLondon(coordinates.latitude, coordinates.longitude)) {
      recorded[venue] = {
        retrieved: { id, name },
        current: {}, // We don't have this one!
      };
    }
  }

  for (const cinema in recorded) {
    process.stdout.write(
      `[🎞️  Location: ${cinema}]${"".padEnd(50 - cinema.length, " ")}`,
    );

    if (!recorded[cinema]) {
      console.log(` - ❌ Missing data`);
    } else {
      const { retrieved, current } = recorded[cinema];
      if (retrieved.name === current.name && retrieved.id === current.id) {
        console.log(` - ✅ Matching data`);
      } else {
        console.log(` - ❌ Data mismatch`);
      }
    }
  }
}

checkEverymanIds();
