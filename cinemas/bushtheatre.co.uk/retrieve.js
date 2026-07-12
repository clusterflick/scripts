const cheerio = require("cheerio");
const attributes = require("./attributes");
const { fetchText, assertSelector } = require("../../common/utils");

async function retrieve() {
  const eventListPage = await fetchText(attributes.url);
  assertSelector(eventListPage, ".events_listing .events_item__link");
  const $ = cheerio.load(eventListPage);

  const eventPageUrls = new Set();
  $(".events_listing .events_item__link").each(function () {
    const href = $(this).attr("href");
    if (href) eventPageUrls.add(new URL(href, attributes.url).href);
  });

  const eventPages = [];
  for (const eventPageUrl of eventPageUrls) {
    eventPages.push(await fetchText(eventPageUrl));
  }

  return {
    eventListPage,
    eventPages,
  };
}

module.exports = retrieve;
