const { fetchText, fetchJson } = require("./utils");

// Shared helpers for venues ticketed by Beyonk. Beyonk is white-label booking
// software rather than a marketplace - there is no cross-organisation search,
// and a shop is only reachable if you already know its organisation id - so it
// belongs here alongside the venues that use it rather than in `sources/`.
//
// Three hosts are involved, all readable anonymously:
//   shop.beyonk.com     - the organisation's experience list
//   checkout.beyonk.com - one experience's detail, including its ticket types
//   api.beyonk.com      - a month of availability for one experience
const SHOP_ORIGIN = "https://shop.beyonk.com";
const CHECKOUT_ORIGIN = "https://checkout.beyonk.com";
const API_ORIGIN = "https://api.beyonk.com";

const getExperiencesUrl = (organisationId) =>
  `${SHOP_ORIGIN}/${organisationId}/experiences`;

// Where a human books this experience, and so the booking URL we publish
const getExperienceUrl = (organisationId, experienceId) =>
  `${SHOP_ORIGIN}/${organisationId}/experiences/${experienceId}?group=experiences`;

const getExperienceDetailUrl = (organisationId, experienceId) =>
  `${CHECKOUT_ORIGIN}/${organisationId}/form/experience/${experienceId}/tickets?source=portal`;

// Availability is served a calendar month at a time, and the request is
// rejected outright without a ticket quantity - the endpoint answers "when
// could I book this ticket", not "when does this run". Any of the
// experience's own ticket ids satisfies it; the quantity is what makes the
// query valid, and the timeslots that come back are the schedule either way.
const getAvailabilityUrl = (experienceId, ticketId, year, month) =>
  `${API_ORIGIN}/api/v1/experiences/${experienceId}/availability/${year}/${month}?${ticketId}=1`;

// Both Beyonk pages are SvelteKit, which ships its server data as JSON inside
// <script type="application/json"> tags - each one wrapping the payload in a
// fetch-response envelope whose `body` is itself a JSON string.
const readEmbeddedPayloads = (html) =>
  [...html.matchAll(/type="application\/json"[^>]*>(.*?)<\/script>/gs)]
    .map(([, block]) => {
      try {
        const envelope = JSON.parse(block);
        const { body } = envelope;
        return typeof body === "string" ? JSON.parse(body) : envelope;
      } catch {
        return undefined;
      }
    })
    .filter((payload) => payload && typeof payload === "object");

// The error route Beyonk redirects a detail URL to when the experience has no
// dates scheduled - see `retrieveExperienceDetail`.
const NO_SCHEDULES_PAGE =
  /\/form\/error\/no-schedules|reason:\s*"no-schedules"/;

/**
 * Every experience an organisation is selling, in the order its shop lists
 * them. Groups appear alongside experiences and are left in for the caller to
 * filter - they carry no schedule of their own.
 * @param {string} organisationId - The Beyonk organisation id
 * @returns {Promise<Array>} The shop's items
 */
async function retrieveExperiences(organisationId) {
  const url = getExperiencesUrl(organisationId);
  const html = await fetchText(url);
  const listing = readEmbeddedPayloads(html).find(({ items }) =>
    Array.isArray(items),
  );

  if (!listing) {
    throw new Error(
      `No experience list found at ${url} - the page structure may have changed`,
    );
  }

  return listing.items;
}

/**
 * One experience's detail - title, description, location and ticket types.
 * An experience the shop still lists but has no dates on has no detail to
 * read, and comes back undefined.
 * @param {string} organisationId - The Beyonk organisation id
 * @param {string} experienceId - The experience id
 * @returns {Promise<Object|undefined>} The experience detail, or undefined
 */
async function retrieveExperienceDetail(organisationId, experienceId) {
  const url = getExperienceDetailUrl(organisationId, experienceId);
  const html = await fetchText(url);

  // Nothing scheduled is a normal state of a shop rather than a breakage - a
  // run can be over, or not yet on sale, while its page stays listed - so it
  // is told apart from a detail page we can no longer read rather than
  // failing the whole venue. Beyonk says so by redirecting the detail URL to
  // its own error route, which `fetch` follows, so what comes back is that
  // error page under the URL we asked for. Read from the page rather than
  // from the redirect: the route names itself in what it serves, both in the
  // layout's echo of the landed URL and in the route data below it, and
  // neither appears on a real detail page.
  if (NO_SCHEDULES_PAGE.test(html)) return undefined;

  const detail = readEmbeddedPayloads(html).find(
    ({ id, pricing }) => id === experienceId && pricing,
  );

  if (!detail) {
    throw new Error(
      `No detail for experience ${experienceId} at ${url} - the page structure may have changed`,
    );
  }

  return detail;
}

/**
 * Every bookable day in one calendar month. Beyonk omits days that have sold
 * out entirely or fallen past their booking cutoff, so what comes back is the
 * schedule as it can still be booked.
 * @param {string} experienceId - The experience id
 * @param {string} ticketId - Any ticket id belonging to the experience
 * @param {number} year - Four-digit year
 * @param {number} month - 1-indexed month
 * @returns {Promise<Array>} Days, each with their timeslots
 */
async function retrieveAvailability(experienceId, ticketId, year, month) {
  const { availability } = await fetchJson(
    getAvailabilityUrl(experienceId, ticketId, year, month),
  );
  return availability || [];
}

// A timeslot's `occurrence` pairs its start with an ISO 8601 duration -
// "2026-08-29T11:30--PT30M" - and only the start locates the screening. The
// venue's own timezone is Europe/London, which the pipeline already runs in.
const getOccurrenceStart = (occurrence) => `${occurrence}`.split("--")[0];

// Beyonk reports remaining places rather than a sold-out flag, so no places
// left is how a sold-out timeslot presents. `bookable` is deliberately not
// used for this: a timeslot past its booking cutoff is also unbookable while
// still having seats, and that isn't the same thing as sold out.
const isSoldOut = ({ remaining }) => remaining === 0;

module.exports = {
  getExperiencesUrl,
  getExperienceUrl,
  getExperienceDetailUrl,
  getAvailabilityUrl,
  retrieveExperiences,
  retrieveExperienceDetail,
  retrieveAvailability,
  getOccurrenceStart,
  isSoldOut,
};
