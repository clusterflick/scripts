const { fetchJson } = require("../utils");

// The events page is an Elfsight calendar, id in the page's own markup. Its feed
// answers directly, which spares the Shopify storefront that rate limits
// anything but a browser.
const WIDGET_ID = "37cb6d7b-26a7-4023-a783-eea200990058";

async function retrieve({ url }) {
  const response = await fetchJson(
    `https://core.service.elfsight.com/p/boot/?page=${encodeURIComponent(url)}&w=${WIDGET_ID}`,
  );
  const events = response?.data?.widgets?.[WIDGET_ID]?.data?.settings?.events;
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error("No events in the Elfsight feed - has the widget changed?");
  }
  return { events };
}

module.exports = retrieve;
