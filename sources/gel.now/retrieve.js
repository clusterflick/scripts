const { fetchJson, fetchText } = require("../../common/utils");
const attributes = require("./attributes");

const API_DOMAIN = "https://api.gel.now";
const EVENTS_API_URL = `${API_DOMAIN}/api/events`;
const VENUES_API_URL = `${API_DOMAIN}/api/venues`;

// gel.now's events API returns every event it has ever known about,
// including placeholder/test rows and events that finished months ago. Its
// venue isn't part of that response either (only the rendered event page
// links to one), so a page fetch is required per event. Bound that to events
// that are actually live and either upcoming or only just finished, rather
// than fetching a detail page for all ~900 rows on every run.
const RELEVANCE_WINDOW_DAYS = 30;

function isRelevant(event) {
  if (!event.is_on_listings_site || !event.is_announced) return false;
  if (event.is_cancelled || event.is_test_event) return false;

  const startTime = new Date(event.start_time);
  if (Number.isNaN(startTime.getTime())) return false;

  const cutoff = new Date(
    Date.now() - RELEVANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  return startTime >= cutoff;
}

async function retrieve() {
  const [allEvents, venues] = await Promise.all([
    fetchJson(EVENTS_API_URL),
    fetchJson(VENUES_API_URL),
  ]);

  const events = allEvents.filter(isRelevant);

  const eventPages = {};
  for (const event of events) {
    const url = `${attributes.domain}/events/${event.id}`;
    try {
      eventPages[event.id] = await fetchText(url);
    } catch (e) {
      console.log(`! Error retrieving event page at ${url} - ${e.message}`);
    }
  }

  return { events, eventPages, venues };
}

module.exports = retrieve;
