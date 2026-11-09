const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { domain } = require("./attributes");
const { eventsUrl, isFilteredToLondon, getEventPaths } = require("./utils");

// From the event index rather than the store page, whose "Upcoming Events"
// cards link the same events: in November 2026 every store page began
// answering 500 with the site's 404 page, while the index and the event pages
// carried on.
async function retrieve() {
  const $ = cheerio.load(await fetchText(eventsUrl));
  if (!isFilteredToLondon($)) {
    throw new Error(`The event index did not recognise London: ${eventsUrl}`);
  }

  const eventPages = {};
  for (const path of getEventPaths($)) {
    const eventUrl = `${domain}${path}`;
    eventPages[eventUrl] = await fetchText(eventUrl);
    // The byline names the event's store, which the transform needs to
    // decide whether it is London's. Without it this is not an event page.
    if (
      !cheerio.load(eventPages[eventUrl])(".event-location-byline-name").length
    ) {
      throw new Error(`No event location on ${eventUrl}`);
    }
  }

  return { eventPages };
}

module.exports = retrieve;
