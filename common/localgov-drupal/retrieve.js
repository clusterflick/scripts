const cheerio = require("cheerio");
const { fetchText, sleep, withJitter } = require("../utils");

// Shared retrieval for councils running LocalGov Drupal, whose events module
// lists events on a paginated, filterable listing page with one page per event.

// Haringey answers with a 429 for every request once a client goes over its
// limit, and keeps doing so for several minutes. At a request a second the 31st
// request, 33 seconds in, was refused - consistent with a limit of around 30 a
// minute, though one observation can't tell that from a count over a longer
// window. A retrieve is under 20 requests, so spacing them about 3 seconds
// apart keeps well clear either way; jittered so we don't knock at robotically
// exact intervals.
const REQUEST_DELAY_MS = 3_000;

async function fetchPaced(url) {
  await sleep(withJitter(REQUEST_DELAY_MS));
  return fetchText(url);
}

// Each council themes its listing differently, so the caller supplies the
// selector for the listing view and for the links to event pages within it. A
// category with nothing on legitimately lists no events, but the view itself
// is always rendered, so its absence means the page has changed. A recurring event appears once per
// occurrence in the listing but has a single page listing every date, so each
// page is fetched once.
async function retrieveEventPages({
  domain,
  listUrl,
  listSelector,
  eventLinkSelector,
  maxPages = 20,
}) {
  const movieListPages = [];
  const moviePageUrls = [];

  let pageUrl = listUrl;
  while (pageUrl) {
    if (movieListPages.length >= maxPages) {
      throw new Error(
        `Exceeded maximum page limit for ${listUrl} — stopping condition may have changed`,
      );
    }

    const movieListPage = await fetchPaced(pageUrl);
    movieListPages.push(movieListPage);

    const $ = cheerio.load(movieListPage);
    const $list = $(listSelector);
    if ($list.length === 0) {
      throw new Error(
        `Unable to find the event listing on ${pageUrl} — the page structure may have changed`,
      );
    }

    $list.find(eventLinkSelector).each((i, link) => {
      const href = $(link).attr("href");
      if (!href) return;
      const url = new URL(href, domain).href;
      if (!moviePageUrls.includes(url)) moviePageUrls.push(url);
    });

    const nextHref = $(".pager__item--next a").attr("href");
    pageUrl = nextHref ? new URL(nextHref, pageUrl).href : null;
  }

  const moviePages = {};
  for (const moviePageUrl of moviePageUrls) {
    moviePages[moviePageUrl] = await fetchPaced(moviePageUrl);
  }

  return { movieListPages, moviePages };
}

module.exports = { retrieveEventPages };
