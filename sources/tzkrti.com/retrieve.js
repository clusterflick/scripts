const { fetchJson } = require("../../common/utils.js");

// The discover page's own listing endpoint, found in the site's app.js. It is
// public JSON and needs no session - a plain fetch is answered where a
// headless browser is met with a Cloudflare challenge.
const LISTING_URL = "https://tzkrti.com/api/v5/filter-events";

// "events" is the listing's catch-all category. Tzkrti's film categories
// aren't used to narrow it: organisers file screenings wherever they like -
// the Asafeer launch night, two short films and a panel, sits under
// "Evenings" - and London runs to a dozen or so events, so the whole city is
// read and each event is judged on its own text downstream.
const CITY = "london";
const COUNTRY = "gb";

// Every listing reports how it chose its events. LOCAL_EVENTS is the city
// asked for, and EMPTY is a page past the end. LOCAL_WITH_PAST is the city's
// last page once it runs to more than one: the rest of its upcoming events in
// `events`, and the page topped up with ones that have already happened in a
// separate `pastEvents`, which is never read. Anything else is the listing
// filling space from elsewhere - an unknown city slug is answered with
// NEARBY_CITIES, events from other cities, rather than an error - so those
// events are never London's. A strategy not seen before fails rather than
// being guessed at.
const STRATEGIES_LOCAL = ["LOCAL_EVENTS", "LOCAL_WITH_PAST"];
const STRATEGIES_NOT_LOCAL = ["EMPTY", "NEARBY_CITIES"];

// London is one page today. This is slack for a busier city, and stops a
// listing whose `hasMore` never clears from spinning.
const MAX_PAGES = 20;

const listingUrl = (page) =>
  `${LISTING_URL}?${new URLSearchParams({
    page: String(page),
    city: CITY,
    country: COUNTRY,
    category: "events",
  })}`;

const isInCity = (event) =>
  event.place_obj?.city?.slug === CITY &&
  event.place_obj?.city?.country?.iso?.toLowerCase() === COUNTRY;

// Each event embeds the organiser's account, with their email address and
// phone number. None of it is used, and retrieved data is published, so it
// is dropped here rather than carried into the release.
const withoutOrganiserAccount = (event) => {
  const copy = { ...event };
  delete copy.user;
  return copy;
};

async function retrieve() {
  const events = {};

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetchJson(listingUrl(page), {
      headers: { Accept: "application/json" },
    });
    const { strategy, hasMore } = response;
    const items = response.events?.items ?? [];

    if (STRATEGIES_LOCAL.includes(strategy)) {
      const elsewhere = items.filter((event) => !isInCity(event));
      if (elsewhere.length > 0) {
        throw new Error(
          `${LISTING_URL} reported ${strategy} for ${CITY} but returned ` +
            `events elsewhere: ${elsewhere.map(({ id }) => id).join(", ")}`,
        );
      }
      // Past events have their own list, so one among the upcoming means the
      // two are no longer kept apart the way this relies on.
      const past = items.filter((event) => event.is_past);
      if (past.length > 0) {
        throw new Error(
          `${LISTING_URL} reported ${strategy} for ${CITY} but listed past ` +
            `events among the upcoming: ${past.map(({ id }) => id).join(", ")}`,
        );
      }
      for (const event of items) {
        events[event.id] = withoutOrganiserAccount(event);
      }
    } else if (!STRATEGIES_NOT_LOCAL.includes(strategy)) {
      throw new Error(
        `${LISTING_URL} answered page ${page} with an unknown strategy ` +
          `"${strategy}" - the listing may have changed`,
      );
    }

    if (!hasMore) return { events };
  }

  throw new Error(
    `Listing did not finish within ${MAX_PAGES} pages at ${LISTING_URL}`,
  );
}

module.exports = retrieve;
