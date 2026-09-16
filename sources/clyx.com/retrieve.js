const { fetchJson } = require("../../common/utils");

// Clyx's pages are a client-rendered app behind a bot check, so this reads the
// JSON API the site itself uses, which needs no browser and no account.
const apiUrl = (path) => `https://app.clyx.com/api/${path}`;

// The feed filters on a city id exactly, and the city is a region label rather
// than the venue's town - a Romford or Box Hill venue still files under London.
// An id the feed doesn't recognise answers with a default set from another city
// instead of an error, so the response is checked against what was asked for
// below rather than trusted.
const LONDON_CITY_ID = "ef6c2cc0-ef51-4f87-8835-ae615b6b7841";

const feedUrl = (page) =>
  apiUrl(
    `map/feed/list/web?page=${page}&pageSize=200&citiesIds[0]=${LONDON_CITY_ID}`,
  );

// Pages are 1-based, and `pagination.total` reads 0 on a page past the end, so
// paging follows `totalPages` from the first response.
async function fetchFeed() {
  const firstPage = await fetchJson(feedUrl(1));
  const events = [...firstPage.data];

  const { totalPages = 1 } = firstPage.pagination ?? {};
  for (let page = 2; page <= totalPages; page += 1) {
    const { data } = await fetchJson(feedUrl(page));
    events.push(...data);
  }

  return events;
}

/**
 * Every event Clyx has on in London, from the feed that powers its own map.
 *
 * Nothing but the city id narrows this, so it is all of London's events rather
 * than the film ones - which is deliberate: a screening titled "Resident Evil"
 * carries no word a keyword filter could catch, and venue matching is what
 * decides relevance.
 */
async function fetchLondonEvents() {
  const events = await fetchFeed();
  const londonEvents = events.filter(({ city }) => city?.id === LONDON_CITY_ID);

  // A stale city id doesn't 404 - it answers with another city's events - so
  // events that are none of them London mean the id no longer names London and
  // the source is reading someone else's listings.
  if (events.length > 0 && londonEvents.length === 0) {
    throw new Error(
      `Clyx returned ${events.length} event(s), none in London - ` +
        `the city id ${LONDON_CITY_ID} may no longer name London`,
    );
  }

  return londonEvents;
}

/**
 * The fields a listing is built from, and only those.
 *
 * An event arrives with the guest list inside it - `members` carries
 * attendees' names and avatars - beside the organiser's contact email and
 * payment-account id. retrieve's output is published as a release, so the
 * record is narrowed here rather than republishing strangers' details.
 */
const pickListingFields = (event) => ({
  id: event.id,
  slug: event.slug,
  name: event.name,
  description: event.description,
  startDate: event.startDate,
  endDate: event.endDate,
  timeZone: event.timeZone,
  location: event.location && {
    locationName: event.location.locationName,
    address: event.location.address,
    latitude: event.location.latitude,
    longitude: event.location.longitude,
  },
  tiers: (event.tiers ?? []).map(({ status }) => ({ status })),
  company: event.company && { name: event.company.name },
});

// The feed carries everything a listing needs except the ticket tiers, which
// are what say whether a screening has sold out.
async function fetchEvent(slug) {
  return pickListingFields(
    await fetchJson(apiUrl(`activity/one/event/${slug}`)),
  );
}

async function retrieve() {
  const londonEvents = await fetchLondonEvents();
  console.log(`    - Found ${londonEvents.length} event(s) on in London`);

  // Keyed by slug, which is what the event's public URL is built from.
  const events = {};
  for (const { slug } of londonEvents) {
    events[slug] = await fetchEvent(slug);
  }

  return { events };
}

module.exports = retrieve;
