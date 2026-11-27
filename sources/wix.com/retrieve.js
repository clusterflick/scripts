const { fetchText } = require("../../common/utils");
const SITES = require("./sites");
const { getListedEvents, getPageEvent, getEventPageUrl } = require("./utils");

// The listing says when and where, but each event's page is fetched for its
// description: the listing leaves it out, and the page's `about` can be stale
// copy left over from the event it was duplicated from. Super Shorts' December
// 2026 sessions carried the previous edition's eleven films there while
// `longDescription` listed the nine actually showing.
async function retrieve() {
  const events = {};

  for (const { domain, listingPages } of SITES) {
    for (const listingPage of listingPages) {
      const listingUrl = `${domain}${listingPage}`;
      const listingHtml = await fetchText(listingUrl);

      for (const { id, slug } of getListedEvents(listingHtml, listingUrl)) {
        if (events[id]) continue;
        const url = getEventPageUrl(listingHtml, domain, slug);
        const event = getPageEvent(await fetchText(url), url);
        events[id] = { domain, url, event };
      }
    }
  }

  return { events };
}

module.exports = retrieve;
