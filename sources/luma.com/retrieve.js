const { fetchJson } = require("../../common/utils.js");

const LISTING_URL = "https://api.luma.com/discover/get-paginated-events";
const EVENT_URL = "https://api.luma.com/event/get";

// Luma geolocates the caller when no coordinates are given, so an unqualified
// request answers with events near whichever runner picked up the job -
// measured 2026-09-22, a CI run was served Columbus, Ohio. The coordinates are
// therefore part of the query rather than a refinement of it, and they are the
// ones Luma itself publishes for its London page
// (`/discover/bootstrap-page`, discplace-QCcNk3HXowOR97j).
const LONDON = { latitude: 51.509865, longitude: -0.118092 };

// Luma has no film or cinema category - the twelve it has are family, books,
// games, tech, food, ai, running, arts, climate, fitness, wellness and crypto -
// so screenings are swept out of Arts & Culture, which is where they are filed.
//
// The categories are a strict subset of the un-slugged feed (measured
// 2026-09-22: the twelve together hold 728 of its 982 London events, and
// nothing appears in a category that the feed lacks), so this trades coverage
// for requests. It costs less than it looks: of eight genuine screenings found
// at venues outside the listing, the five the browse feed carries at all are
// all here, and the three it omits are missing from the un-slugged feed too -
// dropping the category would pay six times the requests to find none of them.
// Those three are what `SEARCH_TERMS` below is for.
const CATEGORY = "arts";

// The browse feed is curated, and a public event can be missing from it at any
// slug: measured 2026-09-22, 18 public London events were reachable by search
// and absent from a full un-slugged sweep. Two of them were screenings at
// venues we hold, so search is not optional here.
//
// It is a poor primary, which is why it only supplements the sweep above. It
// ignores latitude and longitude entirely - a London query answers with Berlin,
// Guatemala and Ibiza - so its results are filtered to London below rather than
// by the API. It caps at 50 with `has_more` always false, so there is no paging
// past that. And it has no relevance floor: a nonsense query still returns
// events, and results decay from good matches into noise, so nothing here can
// be treated as a match on its own. Every one of these is fetched in full and
// judged by its own description, the same as a swept event.
const SEARCH_TERMS = [
  "film",
  "screening",
  "cinema",
  "movie",
  "documentary",
  "short film",
];

// The API caps a page at 50 however large a limit is passed, and pages with a
// keyset cursor over (start_at, api_id) - so a page is a stable window rather
// than an offset, and nothing is skipped or repeated when an event is added
// mid-sweep.
const PAGE_LIMIT = 50;

// A page is ~50 events and London runs to about four of them, so this is slack
// for a busier city rather than a real expectation. It exists so a cursor that
// stops advancing - a change in how the cursor is encoded, say - fails instead
// of spinning.
const MAX_PAGES = 40;

const listingUrl = (params) =>
  `${LISTING_URL}?${new URLSearchParams({
    latitude: String(LONDON.latitude),
    longitude: String(LONDON.longitude),
    pagination_limit: String(PAGE_LIMIT),
    ...params,
  })}`;

const eventUrl = (eventApiId) =>
  `${EVENT_URL}?${new URLSearchParams({ event_api_id: eventApiId })}`;

// Only the category sweep pages - a search answers once and says it has no
// more, whatever it is holding back.
async function fetchCategory() {
  const entries = [];
  let cursor;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = { slug: CATEGORY };
    if (cursor) params.pagination_cursor = cursor;

    const response = await fetchJson(listingUrl(params));
    entries.push(...(response.entries ?? []));

    if (!response.has_more || !response.next_cursor) return entries;
    cursor = response.next_cursor;
  }

  throw new Error(
    `Listing did not finish within ${MAX_PAGES} pages - the pagination cursor ` +
      `at ${LISTING_URL} may have stopped advancing`,
  );
}

// Search ignores the coordinates it is given, so the filter it should have
// applied is applied here. An event with no address cannot be placed at a
// venue and is dropped rather than guessed at.
const isInLondon = (entry) => {
  const address = entry.event?.geo_address_info;
  if (!address || address.country_code !== "GB") return false;
  return /\bLondon\b/.test(address.city_state ?? "");
};

async function fetchSearches() {
  const entries = [];
  for (const term of SEARCH_TERMS) {
    const response = await fetchJson(listingUrl({ query: term }));
    entries.push(...(response.entries ?? []).filter(isInLondon));
  }
  return entries;
}

async function retrieve() {
  const categoryEntries = await fetchCategory();

  // London always has arts events on Luma, so an empty sweep means the listing
  // has stopped answering in the shape we read - a renamed category, a
  // coordinates parameter that no longer filters - rather than that there is
  // nothing on. Left unchecked it is invisible downstream, where every venue
  // simply reports no showings. Only the sweep is asserted on: a search is a
  // grab-bag that can legitimately come back thin, so asserting on it would cry
  // wolf.
  if (categoryEntries.length === 0) {
    throw new Error(
      `No events found under the "${CATEGORY}" category at ${LISTING_URL} - ` +
        `the Luma discover API may have changed`,
    );
  }

  const searchEntries = await fetchSearches();

  // An event reached by both the sweep and a search - or by two searches - is
  // the same event each time, so de-duplicate before spending a request on it.
  const eventApiIds = [
    ...new Set(
      [...categoryEntries, ...searchEntries]
        .map((entry) => entry.event?.api_id)
        .filter(Boolean),
    ),
  ];

  // The listing carries the venue, the times and the price, but not the
  // description, and the description is the only place a listing says what it
  // actually is: "The Mandem: Link Up!" reads as a community meetup until its
  // own text calls it a film screening. So each event is read in full.
  const events = {};
  for (const eventApiId of eventApiIds) {
    events[eventApiId] = await fetchJson(eventUrl(eventApiId));
  }

  return { events };
}

module.exports = retrieve;
