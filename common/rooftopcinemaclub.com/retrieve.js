const cheerio = require("cheerio");
const { fetchText, fetchJson, assertSelector } = require("../utils");
const { getFilmSlug } = require("./utils");

const NO_SCREENINGS_TEXT = "no upcoming screenings";

// The listing runs 15 screenings a page, about five pages in a busy season, so
// this is far past any real season. It is what stops the loop if the site ever
// answers every page number with the same page.
const MAX_PAGES = 50;

// The listing is paged until a page says "No upcoming screenings available.",
// which is also the whole of the first page out of season. Any other page holds
// screening cards. A page with neither - a challenge served with a 200, or new
// copy for the empty listing - is neither kept nor taken for the end: kept, its
// missing screenings were never noticed, and the loop went on past it.
async function retrieve({ domain, url }) {
  const screeningPages = [];

  for (let page = 1; ; page++) {
    if (page > MAX_PAGES) {
      throw new Error(
        `Rooftop Cinema Club's listing at ${url} was still listing screenings after ${MAX_PAGES} pages - is it ignoring the page number?`,
      );
    }
    const pageUrl = `${url}/screenings/list?page=${page}`;
    const html = await fetchText(pageUrl);
    if (html.toLowerCase().includes(NO_SCREENINGS_TEXT)) break;
    assertSelector(
      html,
      ".screening-card",
      `${pageUrl} has neither screenings nor "No upcoming screenings" - the listing may have changed`,
    );
    screeningPages.push(html.trim());
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
