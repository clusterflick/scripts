const cheerio = require("cheerio");
const { fetchText, fetchJson } = require("../utils");
const { getFilmSlug } = require("./utils");

const NO_SCREENINGS_TEXT = "no upcoming screenings";

async function retrieve({ domain, url }) {
  const screeningPages = [];
  let page = 1;

  while (true) {
    const html = await fetchText(`${url}/screenings/list?page=${page}`);
    const isLastPage = html.toLowerCase().includes(NO_SCREENINGS_TEXT);
    if (isLastPage) break;
    screeningPages.push(html.trim());
    page++;
  }

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
