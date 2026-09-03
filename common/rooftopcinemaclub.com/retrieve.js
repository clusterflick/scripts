const cheerio = require("cheerio");
const { fetchText, fetchJson } = require("../utils");
const { getFilmSlug, walkScreeningPages } = require("./utils");

async function retrieve({ domain, url }) {
  const screeningPages = [];

  await walkScreeningPages(
    (page) => fetchText(`${url}/screenings/list?page=${page}`),
    (html) => screeningPages.push(html),
  );

  // Sold-out cards only show doors-open time on the listing page.
  // Fetch the screening details endpoint to get accurate start times.
  const soldOutDetails = {};
  for (const html of screeningPages) {
    const $ = cheerio.load(html);
    $("[data-waitlist-screening]").each((i, el) => {
      const uuid = $(el).attr("data-waitlist-screening");
      if (uuid) soldOutDetails[uuid] = null;
    });
  }

  for (const uuid of Object.keys(soldOutDetails)) {
    soldOutDetails[uuid] = await fetchJson(`${url}/screenings/details/${uuid}`);
  }

  // The listing page has no film details, so fetch a screening page per film
  // for the year and duration.
  const filmHrefs = {};
  for (const html of screeningPages) {
    const $ = cheerio.load(html);
    $(".screening-card h3 a").each((i, el) => {
      const href = $(el).attr("href");
      if (href) filmHrefs[getFilmSlug(href)] ??= href;
    });
  }

  const filmPages = {};
  for (const [filmSlug, href] of Object.entries(filmHrefs)) {
    filmPages[filmSlug] = (await fetchText(`${domain}${href}`)).trim();
  }

  return { screeningPages, soldOutDetails, filmPages };
}

module.exports = retrieve;
