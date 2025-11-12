const cheerio = require("cheerio");
const slugify = require("slugify");
const {
  sanitizePathSegment,
  fetchJson,
  fetchText,
} = require("../common/utils");
const { dailyCache } = require("../common/cache");
const { isInLondon, getNullMapping, getAttributesFor } = require("./utils");

const prefix = "myvue.com-";

async function checkMyvueIds() {
  const venueData = (
    await fetchJson("https://www.myvue.com/api/microservice/showings/cinemas")
  ).result.reduce((list, { cinemas }) => list.concat(cinemas), []);

  const coordinates = {};
  for (const { cinemaId: id, whatsOnUrl } of venueData) {
    const whatsOn = await dailyCache(`myvue-${id}`, async () =>
      fetchText(whatsOnUrl),
    );
    const $ = cheerio.load(whatsOn);
    const [, lat, lon] = $("a.cinema-location-link")
      .attr("href")
      .match(/^https:\/\/maps.apple.com\/\?q=([^,]+),(.*?)$/i);
    coordinates[id] = { lat, lon };
  }

  const recorded = await getNullMapping(prefix);
  for (const { cinemaId: id, fullName } of venueData) {
    const name = fullName
      .replace("London - ", "")
      .replace(" Circus", "")
      .replace(" St Mark's Square", "")
      .replace(" Entertainment Centre", "")
      .replace(" Cook Road", "")
      .replace(" Eltham High Street", "")
      .replace(" St Georges", "")
      .replace(" The Brewery", "")
      .replace(/\s-(?:\s|$)/, " ")
      .replace(/^Vue /i, "")
      .trim();

    const sluggedName = name
      .replace(" (02 Centre)", "")
      .replace(" (not Westfield)", "")
      .replace(" (Finchley Lido)", "")
      .replace(" (Angel Central)", "")
      .replace(" (Shepherd's Bush)", "")
      .replace("West End ", "")
      .trim();
    const venue = `${prefix}${sanitizePathSegment(slugify(sluggedName))}`;

    if (recorded[venue] === null) {
      const attributes = getAttributesFor(venue);
      recorded[venue] = {
        retrieved: { id, name },
        current: {
          id: attributes.cinemaId,
          name: attributes.name.replace("Vue ", "").trim(),
        },
      };
    } else if (await isInLondon(coordinates[id].lat, coordinates[id].lon)) {
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
      if (
        retrieved.name
          .replace("(Shepherd's Bush)", "London")
          .replace(/\([^)]+\)/i, "")
          .replace("Stratford City", "Stratford")
          .trim() === current.name &&
        retrieved.id === current.id
      ) {
        console.log(` - ✅ Matching data`);
      } else {
        failForError = true;
        console.log(` - ❌ Data mismatch`);
      }
    }
  }

  if (failForError) process.exit(1);
}

checkMyvueIds();
