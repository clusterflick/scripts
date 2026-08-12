const cheerio = require("cheerio");
const { fetchText, getText } = require("../../common/utils");
const attributes = require("./attributes");

// The explore page and each festival page share the same image-grid markup:
// tiles on the explore page link to festivals, tiles on a festival page link to
// that festival's events.
const TILE_SELECTOR = "#main .films .film-image-list";

function getAbsoluteUrl(href) {
  return new URL(href, attributes.domain).href;
}

// Each explore tile carries the festival's name alongside its link, which is
// the only place the festival is named consistently — festival pages title
// themselves "Next Event" once their programme is live.
function getFestivals(festivalListPage) {
  const $ = cheerio.load(festivalListPage);

  const festivals = [];
  $(TILE_SELECTOR).each((i, tile) => {
    const $tile = $(tile);
    const href = $tile.find("a").attr("href");
    if (!href) return;

    const name = getText($tile.find(".explore-title"));
    if (!name) {
      throw new Error(
        `Unable to extract a festival name for ${href} on ${attributes.url} — the page structure may have changed`,
      );
    }

    const url = getAbsoluteUrl(href);
    if (festivals.some((festival) => festival.url === url)) return;
    festivals.push({ url, name });
  });

  if (festivals.length === 0) {
    throw new Error(
      `No festivals found on ${attributes.url} — the page structure may have changed`,
    );
  }

  return festivals;
}

// A festival with nothing programmed yet legitimately lists no events, so an
// empty result here is expected rather than a structure change.
function getEventUrls(festivalPage) {
  const $ = cheerio.load(festivalPage);

  const eventUrls = [];
  $(`${TILE_SELECTOR} a`).each((i, link) => {
    const href = $(link).attr("href");
    if (!href) return;

    const url = getAbsoluteUrl(href);
    if (!eventUrls.includes(url)) eventUrls.push(url);
  });

  return eventUrls;
}

async function retrieve() {
  const festivalListPage = await fetchText(attributes.url);

  const festivalPages = {};
  const moviePages = {};

  for (const festival of getFestivals(festivalListPage)) {
    const festivalPage = await fetchText(festival.url);
    festivalPages[festival.url] = festivalPage;

    for (const eventUrl of getEventUrls(festivalPage)) {
      // Screenings belong to a single festival, but skip anything already
      // fetched so a shared event can never be requested twice.
      if (moviePages[eventUrl]) continue;

      moviePages[eventUrl] = {
        html: await fetchText(eventUrl),
        festival: festival.name,
      };
    }
  }

  return { festivalListPage, festivalPages, moviePages };
}

module.exports = retrieve;
