const { fetchJson } = require("../../common/utils.js");
const { parseLocalTime, LONDON, SEARCH_RADIUS_METRES } = require("./utils");

// Billetto's own pages don't list events in their HTML - an organiser's page
// and the category pages fill themselves in from Algolia in the browser, with
// these credentials (a search-only key, in the site's script bundle). Asking
// Algolia directly is the same request the page makes, without loading the
// page around it. A rotated key answers 403, which fails the retrieve.
const ALGOLIA = {
  appId: "YNEUY03Z8Q",
  apiKey: "8de1d74c7c7de20e35c1f7215e7c699a",
  indexName: "events_by_date",
};
const SEARCH_URL = `https://${ALGOLIA.appId}-dsn.algolia.net/1/indexes/${ALGOLIA.indexName}/query`;

// One index holds every country Billetto sells in; 58 is billetto.co.uk, the
// filter the UK site's own pages put on every search.
const UK = "organization_id:58";

// Events are asked for within a radius of central London. Greater London's
// boundary is at most 32.2km from Trafalgar Square, and the furthest venue we
// hold (Upminster Windmill) 26.4km, so 40km takes in all of it with a margin -
// and the tests fail if a venue is ever added beyond it.
//
// An organiser picks a type and a subcategory, and screenings aren't always
// filed under film: that day's London screening of "The Killing of Awdah
// Hathaleen" was `type: screening` under charity / international aid. So
// either marks an event as one to read. `film_media` as a whole is left out -
// it held a live music night and a TV fan meeting, and no film the other two
// missed.
//
// A subscription is a membership rather than an event with a date, and the
// site leaves those out of its own listings the same way.
const FILM_EVENTS = `${UK} AND (type:screening OR subcategory:film) AND NOT kind:subscription`;

const AROUND_LONDON = {
  aroundLatLng: `${LONDON.lat},${LONDON.lon}`,
  aroundRadius: SEARCH_RADIUS_METRES,
};

// Algolia's ceiling for a page. A page is far more than London's film events
// run to (3, measured 2026-11-15), so paging is slack rather than an
// expectation.
const HITS_PER_PAGE = 1000;
const MAX_PAGES = 10;

const search = (params) =>
  fetchJson(SEARCH_URL, {
    method: "POST",
    headers: {
      "X-Algolia-Application-Id": ALGOLIA.appId,
      "X-Algolia-API-Key": ALGOLIA.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query: "", ...params }),
  });

async function fetchFilmEvents() {
  const hits = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await search({
      filters: FILM_EVENTS,
      ...AROUND_LONDON,
      hitsPerPage: HITS_PER_PAGE,
      page,
    });
    hits.push(...response.hits);
    if (page + 1 >= response.nbPages) return hits;
  }
  throw new Error(
    `Billetto's film events did not finish within ${MAX_PAGES} pages of ${HITS_PER_PAGE}`,
  );
}

// There are few enough film events that none at all is a believable answer,
// so it can't be what says the query has broken. Billetto always has
// something on around London (187 events, measured 2026-11-15), so that is
// asked first, within the same radius: an index renamed, or a filter or geo
// parameter that no longer matches, shows up as nothing at all rather than as
// every venue quietly going without its screenings.
async function assertIndexAnswers() {
  const { nbHits } = await search({
    filters: UK,
    ...AROUND_LONDON,
    hitsPerPage: 0,
  });
  if (!nbHits) {
    throw new Error(
      `Billetto's Algolia index "${ALGOLIA.indexName}" has no events around ` +
        `London - the index, its organization_id filter or the geo search ` +
        `may have changed`,
    );
  }
}

// An event's time is in two forms. `starts_at` and `ends_at` are the local
// time in the event's `time_zone` ("Dec 01 2026 19:00"); `start_time` and
// `end_time` are seconds since the epoch. They aren't the same thing on every
// event, which is why the local pair is the one read:
//
// - On a "scheduled" event - one listing over several occurrences - the epochs
//   are the whole series': History on Film's La Haine carried a `start_time` of
//   12 Dec 2025, its first ever showing, against a `starts_at` of 12 Dec 2026,
//   the one on sale. The local pair and `local_dates` are the occurrence still
//   to come.
// - The JSON-LD on the page (and in `schema`) follows the epochs, and its
//   offset is whatever zone the event was saved from - +02:00 on one London
//   event - so it is no help either.
//
// On a regular event the two forms are the same moment, so they are held to
// each other there: the local time failing to be the instant it claims, say
// through BST, fails the retrieve rather than moving every screening an hour.
function assertEpochMatches(hit, localField, epochField) {
  const local = parseLocalTime(hit, localField);
  if (local.getTime() !== hit[epochField] * 1000) {
    throw new Error(
      `Billetto event ${hit.objectID} ${localField} "${hit[localField]}" is not ` +
        `its ${epochField} ${hit[epochField]} (${new Date(hit[epochField] * 1000).toISOString()})`,
    );
  }
}

// A scheduled event only carries the time of its next occurrence. Its other
// days are in `local_dates` with no time to put them at, so one with more than
// a single day still to come can't be listed from the search hit alone. No film
// event has been one yet; when one is, it needs reading from its own page.
function assertSingleOccurrence(hit) {
  if (hit.kind === "scheduled" && (hit.local_dates ?? []).length > 1) {
    throw new Error(
      `Billetto event ${hit.objectID} (${hit.url}) is a scheduled event over ` +
        `${hit.local_dates.length} days - only its next time is in the search hit`,
    );
  }
}

function assertTimes(hit) {
  assertSingleOccurrence(hit);
  parseLocalTime(hit, "starts_at");
  parseLocalTime(hit, "ends_at");
  if (hit.kind !== "scheduled") {
    assertEpochMatches(hit, "starts_at", "start_time");
    assertEpochMatches(hit, "ends_at", "end_time");
  }
}

async function retrieve() {
  await assertIndexAnswers();
  const hits = await fetchFilmEvents();

  hits.forEach(assertTimes);

  const events = {};
  for (const hit of hits) {
    // Only the fields read downstream are kept. A hit also carries click
    // counts, ticket stock and the organiser's revenue, which change by the
    // hour and would make every day's retrieved data differ for no reason.
    events[hit.objectID] = {
      objectID: hit.objectID,
      name: hit.name,
      description: hit.description,
      url: hit.url,
      kind: hit.kind,
      type: hit.type,
      subcategory: hit.subcategory,
      brand: hit.brand,
      venue_name: hit.venue_name,
      city: hit.city,
      _geoloc: hit._geoloc,
      time_zone: hit.time_zone,
      starts_at: hit.starts_at,
      ends_at: hit.ends_at,
      hide_end_date: hit.hide_end_date,
      event_availability: hit.event_availability,
    };
  }

  return { events };
}

module.exports = retrieve;
