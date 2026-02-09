const cheerio = require("cheerio");
const getPageWithPlaywright = require("../../common/get-page-with-playwright");

// Each venue/organization has its own Tito page - add new slugs here
const VENUE_SLUGS = [
  "queereast", // Queer East
];

async function retrieveVenue(slug) {
  const url = `https://ti.to/${slug}/`;
  const cacheKey = `tito-${slug}`;

  const movieListPage = await getPageWithPlaywright(
    url,
    cacheKey,
    async (page) => {
      await page.waitForLoadState();
      await page.locator(".tito-events--upcoming").waitFor({ strict: false });
      return await page.content();
    },
  );

  const $ = cheerio.load(movieListPage);
  const moviePageUrls = $(".tito-events--upcoming .tito-event--event-link")
    .map((i, el) => $(el).attr("href"))
    .get();

  const moviePages = {};
  for (const moviePageUrl of moviePageUrls) {
    const absoluteUrl = moviePageUrl.startsWith("http")
      ? moviePageUrl
      : `https://ti.to${moviePageUrl}`;
    const pageCacheKey = `tito-${slug}-${moviePageUrl.split("/").filter(Boolean).pop()}`;
    moviePages[absoluteUrl] = await getPageWithPlaywright(
      absoluteUrl,
      pageCacheKey,
      async (page) => {
        await page.waitForLoadState();
        return await page.content();
      },
    );
  }

  return { movieListPage, moviePages };
}

async function retrieve() {
  const venues = {};

  for (const slug of VENUE_SLUGS) {
    venues[slug] = await retrieveVenue(slug);
  }

  return venues;
}

module.exports = retrieve;
