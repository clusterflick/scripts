const cheerio = require("cheerio");
const { fetchJson, fetchText, getText } = require("../../common/utils");
const { url } = require("./attributes");

const getEndpointUrl = (page, { tvn1, tvn2 }) =>
  `https://stanleyarts.org/wp-json/tribe/views/v2/html?u=%2Fevents%2Flist%2Fpage%2F${page}%2F%3Fhide_subsequent_recurrences%3D1%26tribe_eventcategory%255B0%255D%3D240&smu=true&tvn1=${tvn1}&tvn2=${tvn2}`;

async function retrieve() {
  const eventsPage = await fetchText(url);
  const $ = cheerio.load(eventsPage);
  const eventNonces = JSON.parse(
    getText($('script[data-js="tribe-events-view-nonce-data"]').eq(0)),
  );

  const movieListPages = [];
  let page = 1;

  while (page <= 10) {
    const { html } = await fetchJson(getEndpointUrl(page, eventNonces));
    if (!html.includes("application/ld+json")) break;
    movieListPages.push(html);
    page += 1;
  }

  if (page > 10) {
    throw new Error(
      "Exceeded maximum page limit — stopping condition may have changed",
    );
  }

  return { movieListPages };
}

module.exports = retrieve;
