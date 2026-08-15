const { fetchJson } = require("../../common/utils");

const API_DOMAIN = "https://api.gel.now";
const LISTINGS_API_URL = `${API_DOMAIN}/api/events/listings`;
const VENUES_API_URL = `${API_DOMAIN}/api/venues`;

// This is the same paginated endpoint gel.now's own site calls to render its
// listings, already filtered server-side to what's actually on-site,
// announced, not cancelled and not test data - and each event carries its
// venue(s) inline, so no per-event page fetch is needed to learn where it's
// happening.
const PAGE_SIZE = 100;

async function fetchAllListings() {
  const events = [];
  let offset = 0;

  while (true) {
    const url = `${LISTINGS_API_URL}?limit=${PAGE_SIZE}&offset=${offset}&sort_by=date_asc`;
    const page = await fetchJson(url);
    events.push(...page.events);

    offset += PAGE_SIZE;
    if (offset >= page.total_count) break;
  }

  return events;
}

async function retrieve() {
  // The listings endpoint's embedded venue objects omit their postcode, so
  // the separate venues endpoint (a single request) fills that in for the
  // postcode fallback in venue matching.
  const [events, venues] = await Promise.all([
    fetchAllListings(),
    fetchJson(VENUES_API_URL),
  ]);

  return { events, venues };
}

module.exports = retrieve;
