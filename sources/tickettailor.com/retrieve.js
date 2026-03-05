const getPageWithPlaywright = require("../../common/get-page-with-playwright");

// Each venue/organization has its own Ticket Tailor page - add new slugs here
const VENUE_SLUGS = [
  "weflockcic", // Good Shepherd Studios
  "maghrebcine", // Maghreb Ciné film club
  "offbeatfolkfilm", // Offbeat Folk Film
  "sickgirlfilms", // Sick Girl Films
  "filmlondon", // Film London
  "sirenscreen", // Siren Screen
  "eastlondonexperimentalfilmclub", // East London Experimental Film Club
  "wimbledonfilmclub", // Wimbledon Film Club
  "yourcinema", // Your Cinema
  "offbeatfolkfilm", // Offbeat Folk Film Club
];

async function retrieveVenuePage(slug) {
  const url = `https://www.tickettailor.com/events/${slug}`;
  const cacheKey = `tickettailor-${slug}`;

  const page = await getPageWithPlaywright(url, cacheKey, async (page) => {
    await page.waitForLoadState();
    await page
      .locator(".main-events-listing__events")
      .waitFor({ strict: false });
    return await page.content();
  });

  return { slug, page };
}

async function retrieve() {
  const clubPages = {};

  for (const slug of VENUE_SLUGS) {
    const { page } = await retrieveVenuePage(slug);
    clubPages[slug] = page;
  }

  return { clubPages };
}

module.exports = retrieve;
