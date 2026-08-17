const { addYears, format } = require("date-fns");
const {
  fetchText,
  fetchJson,
  sleep,
  withJitter,
} = require("../../common/utils.js");
const { dailyCache } = require("../../common/cache.js");
const { getAllCinemaAttributes } = require("../../cinemas");
const { findMatchingCinema } = require("../../common/source-utils");
const attributes = require("./attributes");
const {
  extractTransferState,
  extractPlanGrid,
  extractVenuePlanIds,
} = require("./utils");

// Fever files a city's plans under "what plan filters" (its categories), and
// its Cinema filter can't be relied on to hold the screenings: a dinner served
// course by course alongside a film is filed under Food & Drink, and some of
// those nights appear under no filter at all. So discovery reads the filter
// carrying the city's whole catalogue and decides what's interesting from the
// venue, rather than trusting Fever to have categorised it as cinema.
//
// That catalogue is ranked and capped at 250 rather than exhaustive, so it can
// only be a way in: it tells us which venues Fever hosts, not everything they
// have on. A venue's own page is authoritative about that, so each venue we
// recognise gets read directly - which is what turns up the screenings sitting
// below the cap.
const CATALOGUE_WPF_ID = 967;
const CITY_CODE = "LON";
const CITY_SLUG = "london";
const PLANS_PER_PAGE = 48;

// How far ahead to ask for a plan's calendar. Fever caps how much availability
// it will return, so this is an upper bound rather than a promise.
const CALENDAR_WINDOW_YEARS = 1;

// Reading the whole catalogue costs a request per plan, and Fever sits behind a
// CloudFront rate limit that answers a burst with a 403 for the IP rather than a
// 429 for the request - so there's nothing to back off from, only a run to
// throw away. Roughly a request a second stays under it; jittered so we don't
// knock at robotically exact intervals.
const REQUEST_DELAY_MS = 1_000;

// Node's fetch announces itself as "User-Agent: node", and once a burst has put
// Fever's rate limit on alert it refuses that client outright - a 403 for every
// request, while the identical request with a browser's user agent is served
// normally. Sending one keeps us on the same footing as any other reader of a
// public listing.
const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0",
};

// Every fetch goes through the daily cache, so a run cut short - by a block, a
// timeout, or a failed plan - replays what it already has instead of paying for
// those requests again (and re-provoking the limit) on the retry.
const fetchCached = (cacheKey, fetcher, url) =>
  dailyCache(cacheKey, async () => {
    await sleep(withJitter(REQUEST_DELAY_MS));
    return fetcher(url, { headers: REQUEST_HEADERS });
  });

function getPlanGridApiUrl(trackerId, page) {
  return `${attributes.domain}/api/4.4/category/plan_grid/?wpf_id=${CATALOGUE_WPF_ID}&city_code=${CITY_CODE}&page=${page}&recommendation_tracker_id=${trackerId}&items_per_page=${PLANS_PER_PAGE}&sorting_type=relevance`;
}

function getPlanApiUrl(planId) {
  return `${attributes.domain}/api/4.4/plans/${planId}/`;
}

function getVenueUrl(slug) {
  return `${attributes.domain}/en/${CITY_SLUG}/venue/${slug}`;
}

function getAvailabilityApiUrl(planId, placeId, from, to) {
  return `${attributes.domain}/api/4.2/plans/${planId}/place/${placeId}/availability/?from=${from}&to=${to}`;
}

function getSessionsApiUrl(planId, placeId, date) {
  return `${attributes.domain}/api/4.2/plans/${planId}/place/${placeId}/sessions_for_date/${date}/?exclude_sessions_as_add_ons=true&include_add_ons=true`;
}

/**
 * Every plan id in the city's catalogue - the first page comes rendered into
 * the listing page, the rest from the plan grid API.
 */
async function fetchCataloguePlanIds(movieListPage) {
  const { trackerId, plans, hasMultiplePages } = extractPlanGrid(
    extractTransferState(movieListPage, attributes.url),
    attributes.url,
  );

  const cataloguePlans = [...plans];
  if (hasMultiplePages) {
    let page = 2;
    while (true) {
      const { results, next_page: nextPage } = await fetchCached(
        `feverup-catalogue-page-${page}`,
        fetchJson,
        getPlanGridApiUrl(trackerId, page),
      );
      cataloguePlans.push(...results);
      if (!nextPage) break;
      page = nextPage;
    }
  }

  return [...new Set(cataloguePlans.map(({ id }) => id))];
}

/**
 * The places on a plan that we hold a cinema for.
 */
function getKnownPlaces(knownCinemas, planDetail) {
  return (planDetail.places || []).filter(
    ({ name, latitude, longitude, address }) =>
      findMatchingCinema(
        knownCinemas,
        name,
        { lat: latitude, lon: longitude },
        { eventAddress: address },
      ),
  );
}

async function fetchPlanDetail(planId) {
  return fetchCached(
    `feverup-plan-${planId}`,
    fetchJson,
    getPlanApiUrl(planId),
  );
}

/**
 * Every plan id the venues we recognise are hosting, read from their own pages
 * rather than from the capped catalogue.
 */
async function fetchPlanIdsAtKnownVenues(knownCinemas, planDetails) {
  const slugs = new Set();
  for (const planDetail of Object.values(planDetails)) {
    for (const place of getKnownPlaces(knownCinemas, planDetail)) {
      if (place.slug) slugs.add(place.slug);
    }
  }

  const planIds = new Set();
  for (const slug of slugs) {
    const url = getVenueUrl(slug);
    const html = await fetchCached(`feverup-venue-${slug}`, fetchText, url);
    for (const planId of extractVenuePlanIds(html, url)) {
      planIds.add(planId);
    }
  }
  return planIds;
}

async function fetchSessionsForPlan(planId, places, from, to) {
  const sessions = {};
  for (const place of places) {
    const { dates } = await fetchCached(
      `feverup-availability-${planId}-${place.id}`,
      fetchJson,
      getAvailabilityApiUrl(planId, place.id, from, to),
    );

    for (const date of Object.keys(dates || {})) {
      const url = getSessionsApiUrl(planId, place.id, date);
      try {
        const data = await fetchCached(
          `feverup-sessions-${planId}-${place.id}-${date}`,
          fetchJson,
          url,
        );
        sessions[`${place.id}:${date}`] = data;
      } catch (e) {
        console.log(
          `! Error fetching sessions for plan ${planId}, place ${place.id}, date ${date} - ${e.message}`,
        );
      }
    }
  }
  return sessions;
}

async function retrieve() {
  const movieListPage = await fetchCached(
    "feverup-catalogue-page-1",
    fetchText,
    attributes.url,
  );

  const planIds = await fetchCataloguePlanIds(movieListPage);
  if (planIds.length === 0) {
    throw new Error(`No plans found in the catalogue at ${attributes.url}`);
  }

  console.log(` - Requesting details for ${planIds.length} catalogue plans...`);
  const planDetails = {};
  for (const planId of planIds) {
    planDetails[planId] = await fetchPlanDetail(planId);
  }

  const knownCinemas = getAllCinemaAttributes();

  // The catalogue only ranks the top 250, so a venue's quieter listings never
  // appear in it. Ask the venues we recognise what else they have on.
  const venuePlanIds = await fetchPlanIdsAtKnownVenues(
    knownCinemas,
    planDetails,
  );
  const missingPlanIds = [...venuePlanIds].filter((id) => !(id in planDetails));

  console.log(
    ` - Requesting details for ${missingPlanIds.length} plans found only at known venues...`,
  );
  for (const planId of missingPlanIds) {
    planDetails[planId] = await fetchPlanDetail(planId);
  }

  // A plan's sessions cost a request per place per date, so only spend them on
  // plans held at a venue we know about. Every plan's details are kept either
  // way, so a venue we don't hold yet still shows up in venue discovery.
  const today = new Date();
  const from = format(today, "yyyy-MM-dd");
  const to = format(addYears(today, CALENDAR_WINDOW_YEARS), "yyyy-MM-dd");

  const knownPlaces = Object.entries(planDetails)
    .map(([planId, planDetail]) => [
      planId,
      getKnownPlaces(knownCinemas, planDetail),
    ])
    .filter(([, places]) => places.length > 0);

  console.log(
    ` - Requesting sessions for ${knownPlaces.length} plans at known venues...`,
  );
  const sessionPages = {};
  for (const [planId, places] of knownPlaces) {
    sessionPages[planId] = await fetchSessionsForPlan(planId, places, from, to);
  }

  return { movieListPage, planDetails, sessionPages };
}

module.exports = retrieve;
