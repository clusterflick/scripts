const slugify = require("slugify");
const { sanitizePathSegment } = require("../common/utils");
const getPageWithPlaywright = require("../common/get-page-with-playwright");
const { isInLondon, getNullMapping, getAttributesFor } = require("./utils");

const prefix = "picturehouses.com-";

async function checkPicturehouseIds() {
  const url = "https://www.picturehouses.com";
  const cacheKey = "check-picturehouse-ids";
  const venueData = await getPageWithPlaywright(url, cacheKey, async (page) => {
    await page.waitForLoadState();
    return page.evaluate((url) => {
      return fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Content-Type": "application/json",
        },
        // eslint-disable-next-line no-undef
        body: JSON.stringify({ _token: window.document.forms[2][0].value }),
      }).then((response) => response.json());
    }, "https://www.picturehouses.com/ajax-cinema-list");
  });

  const recorded = await getNullMapping(prefix);
  for (let {
    cinema_id: id,
    name,
    latitude,
    longitude,
  } of venueData.cinema_list) {
    name = name
      .replace("Picturehouse", "")
      .replace("Ritzy", "The Ritzy")
      .trim();
    const venue = `${prefix}${sanitizePathSegment(slugify(name))}`;

    if (recorded[venue] === null) {
      const attributes = getAttributesFor(venue);
      recorded[venue] = {
        retrieved: { id, name },
        current: {
          id: attributes.cinemaId,
          name: attributes.name
            .replace("Picturehouse", "")
            .replace("Library", "")
            .split("&")[0]
            .trim(),
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

checkPicturehouseIds();
