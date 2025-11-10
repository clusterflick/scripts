const slugify = require("slugify");
const { sanitizePathSegment } = require("../common/utils");
const getPageWithPlaywright = require("../common/get-page-with-playwright");
const { isInLondon, getNullMapping, getAttributesFor } = require("./utils");

const prefix = "odeon.co.uk-";
const normalize = (value) =>
  value
    .replace("ODEON Luxe & Dine", "")
    .replace("ODEON Luxe ", "")
    .replace("ODEON ", "")
    .replace("London ", "")
    .trim();

async function checkOdeonIds() {
  const url = "https://www.odeon.co.uk";
  const cacheKey = "check-odeon-ids";
  const venueData = await getPageWithPlaywright(url, cacheKey, async (page) => {
    await page.waitForLoadState();
    return page.evaluate((url) => {
      return fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Content-Type": "application/json",
          // eslint-disable-next-line no-undef
          authorization: `Bearer ${window.initialData.api.authToken}`,
        },
      }).then((response) => response.json());
    }, "https://vwc.odeon.co.uk/WSVistaWebClient/ocapi/v1/sites");
  });

  const recorded = await getNullMapping(prefix);
  for (let {
    id,
    name: { text: name },
    location: { latitude, longitude },
  } of venueData.sites) {
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

checkOdeonIds();
