const cheerio = require("cheerio");
const slugify = require("slugify");
const { sanitizePathSegment, fetchText } = require("../common/utils");
const { dailyCache } = require("../common/cache");
const { isInLondon, getNullMapping, getAttributesFor } = require("./utils");

const prefix = "omniplex.co.uk-";
const normalize = (value) =>
  value.replace("Omniplex ", "").replace(" Surrey", "").trim();

async function checkOmniplexIds() {
  const mainSite = await fetchText("https://www.omniplexcinemas.co.uk");
  const $ = cheerio.load(mainSite);
  const venueData = $("#homeSelectCinema option")
    .map((i, el) => ({ id: $(el).attr("id"), name: $(el).text().trim() }))
    .get()
    .filter(({ id }) => id);

  for (const venue of venueData) {
    const venuePage = await dailyCache(`omniplex-${venue.id}`, async () =>
      fetchText(`https://www.omniplexcinemas.co.uk/cinema/${venue.id}`),
    );
    const $ = cheerio.load(venuePage);
    const [, lon, lat] = $(".OMP_locationMap .OMP_contactInfo .mainInfo a")
      .attr("href")
      .match(
        /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=([^,]+),(.*?)&/i,
      );
    venue.coordinates = { lat, lon };
  }

  const recorded = await getNullMapping(prefix);
  for (let { id, name, coordinates } of venueData) {
    name = normalize(name);
    const venue = `${prefix}${sanitizePathSegment(slugify(id))}`;

    if (recorded[venue] === null) {
      const attributes = getAttributesFor(venue);
      recorded[venue] = {
        retrieved: { id, name },
        current: {
          id: attributes.cinemaId,
          name: normalize(attributes.name),
        },
      };
    } else if (await isInLondon(coordinates.lat, coordinates.lon)) {
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

checkOmniplexIds();
