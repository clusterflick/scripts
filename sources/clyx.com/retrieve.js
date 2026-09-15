const { fetchJson } = require("../../common/utils");
const seededOrganizerSlugs = require("./seeded-organizers");

// Clyx's own pages are a client-rendered app whose HTML carries no listing, and
// the web tier answers a plain request with an AWS WAF challenge - so both
// calls here go to the JSON API the app itself uses, which needs no browser and
// no account.
//
// One endpoint on that API is deliberately not used: the guest list behind the
// event page's "see full list" serves attendee names, email addresses and
// phone numbers to anyone who asks. A listing needs none of it, and recording
// it into a test fixture would commit other people's personal data.
const apiUrl = (path) => `https://app.clyx.com/api/${path}`;

// Pages are 1-based. `pagination.total` is not a global count - it reads 0 on a
// page past the end - so paging follows `totalPages` from the first response
// rather than counting results. 50 is comfortably above what a film club has on
// at once, so the loop normally makes one request.
const PAGE_SIZE = 50;

const organizerListUrl = (slug, page) =>
  apiUrl(`company/${slug}/activity/list?page=${page}&pageSize=${PAGE_SIZE}`);

/**
 * One page of an organiser's calendar.
 *
 * Every slug we ask for is seeded by hand, so a 404 is ours to fix: the
 * organiser has been renamed or has left the platform. Anything else - a
 * timeout, a 5xx, a throttle - is the platform's and passes straight through,
 * because reporting it as a stale slug would send someone editing a list that
 * is still correct.
 */
async function fetchOrganizerPage(slug, page) {
  try {
    return await fetchJson(organizerListUrl(slug, page));
  } catch (error) {
    if (error.status !== 404) throw error;
    throw new Error(
      `Seeded organiser ${slug} could not be read, so ` +
        `sources/clyx.com/seeded-organizers.js needs updating`,
      { cause: error },
    );
  }
}

/**
 * Every event an organiser has coming up, in the calendar's own listing shape.
 *
 * The calendar answers with upcoming events only - Coffeehouse Cinema's 14
 * events come back as the 2 still to happen - so there is nothing to filter by
 * date here.
 */
async function fetchOrganizerEvents(slug) {
  const firstPage = await fetchOrganizerPage(slug, 1);
  const events = [...firstPage.data];

  const { totalPages = 1 } = firstPage.pagination ?? {};
  for (let page = 2; page <= totalPages; page += 1) {
    const { data } = await fetchOrganizerPage(slug, page);
    events.push(...data);
  }

  return events;
}

/**
 * The fields a listing is built from, and only those.
 *
 * An event record arrives with the guest list inside it - `members` carries
 * attendees' names and avatars - alongside the organiser's contact email and
 * payment-account id. What retrieve returns is published as a release, so
 * keeping the record whole would republish four named strangers per screening
 * to anyone who downloads it. Nothing downstream reads any of it: the tiers are
 * read for their status and the company for its name, so both are narrowed to
 * that here rather than trusted to be ignored later.
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

/**
 * An event's full record, which the calendar listing doesn't carry: the ticket
 * tiers say whether a screening has sold out.
 */
async function fetchEvent(slug) {
  return pickListingFields(
    await fetchJson(apiUrl(`activity/one/event/${slug}`)),
  );
}

async function retrieve() {
  const eventSlugs = new Set();

  for (const organizerSlug of seededOrganizerSlugs) {
    const events = await fetchOrganizerEvents(organizerSlug);
    for (const { slug } of events) eventSlugs.add(slug);
  }

  console.log(
    `    - Found ${eventSlugs.size} upcoming event(s) across ` +
      `${seededOrganizerSlugs.length} organiser(s)`,
  );

  // Keyed by slug, which is also what the event's public URL is built from, so
  // find-events can go from a listing back to the page a reader would open.
  // An organiser tours the same night between cities rather than repeating a
  // slug, but two of our organisers co-promoting one screening would list it
  // twice, so the set above spends one request on it either way.
  const events = {};
  for (const slug of eventSlugs) {
    events[slug] = await fetchEvent(slug);
  }

  return { events };
}

module.exports = retrieve;
