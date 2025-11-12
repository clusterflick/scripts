const slugify = require("slugify");
const { fetchText, sanitizePathSegment } = require("../common/utils");
const { isInLondon, getNullMapping, getAttributesFor } = require("./utils");

const prefix = "cineworld.co.uk-";
const normalize = (value) =>
  value.replace("Cineworld ", "").replace("London - ", "").trim();

async function checkCineworldIds() {
  const mainPage = await fetchText("https://www.cineworld.co.uk/");
  const venueData = JSON.parse(
    mainPage.match(/apiSitesList\s*=\s*(\[[^\]]+\]),/i)[1],
  );

  const recorded = await getNullMapping(prefix);
  for (let { externalCode: id, name, latitude, longitude } of venueData) {
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
    } else if (await isInLondon(latitude, longitude)) {
      recorded[venue] = {
        retrieved: { id, name },
        current: {}, // We don't have this one!
      };
    }
  }

  let failForError = false;
  for (const cinema in recorded) {
    process.stdout.write(
      `[🎞️  Location: ${cinema}]${"".padEnd(50 - cinema.length, " ")}`,
    );

    if (!recorded[cinema]) {
      failForError = true;
      console.log(` - ❌ Missing data`);
    } else {
      const { retrieved, current } = recorded[cinema];
      if (retrieved.name === current.name && retrieved.id === current.id) {
        console.log(` - ✅ Matching data`);
      } else {
        failForError = true;
        console.log(` - ❌ Data mismatch`);
      }
    }
  }

  if (failForError) process.exit(1);
}

checkCineworldIds();
