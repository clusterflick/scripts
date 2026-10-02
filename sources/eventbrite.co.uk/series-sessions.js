const { fetchJson, sleep, withJitter } = require("../../common/utils.js");
const { dailyCache } = require("../../common/cache.js");

// An Eventbrite series is several sessions sharing one title, each its own
// event with its own id, date and checkout. Neither of the ways retrieve finds
// events reaches all of them. The search is a ranked window, and on the
// 2026-10-02 retrieve it reached one session of each of the 15 series at a
// venue we hold. The organiser calendar lists sessions individually for some
// organisers and stops around six months out - 8 of Everyman Muswell Hill's 15
// - and for others collapses a series into a single row whose id is the series'
// own, which reaches none of them. Leytonstone Library's weekly kids' film club
// published 1 of its 48 sessions that way. Across those 15 series, 42 of 142
// sessions were published.
//
// This is the endpoint Eventbrite's own date picker reads, and it answers a
// plain request. Unfiltered it lists every session the series has ever had,
// oldest first: Theatreship's mystery screenings reported 122, all of them
// past, with the 3 still to come on a page beyond. `time_filter` is what keeps
// it to the sessions worth publishing, and it is applied rather than ignored -
// the endpoint answers an unknown parameter with a 400.
const SERIES_API_BASE = "https://www.eventbrite.co.uk/api/v3/series";

// The endpoint's own page size is 50, and a weekly strand runs to 48 within a
// year. How many pages there are is reported, so this only guards against the
// endpoint never saying it has finished - loudly, because stopping short here
// would publish part of a series as if it were all of it.
const MAX_PAGES = 20;

const SERIES_RETRY_CONFIG = { retries: 3, delayMs: 5_000, backoffFactor: 2 };
const SERIES_REQUEST_DELAY_MS = 2_000;

/**
 * The series id of an event page, if the event is a session of one.
 */
function getSeriesId(details) {
  const basicInfo = details?.props?.pageProps?.context?.basicInfo;
  if (!basicInfo?.isSeries) return null;
  if (!basicInfo.seriesId) {
    throw new Error(
      `Event ${basicInfo.id} is marked as a series but carries no series id`,
    );
  }
  return `${basicInfo.seriesId}`;
}

/**
 * Every current and future session of a series.
 */
async function fetchSeriesSessions(seriesId) {
  const sessions = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await dailyCache(
      `eventbrite-series-${seriesId}-${page}`,
      async () => {
        await sleep(withJitter(SERIES_REQUEST_DELAY_MS));
        return fetchJson(
          `${SERIES_API_BASE}/${seriesId}/events/?time_filter=current_future&page=${page}`,
          undefined,
          SERIES_RETRY_CONFIG,
        );
      },
    );

    if (!Array.isArray(data.events)) {
      throw new Error(`Series ${seriesId} returned no list of sessions`);
    }
    sessions.push(...data.events);

    if (!data.pagination?.has_more_items) return sessions;
  }

  throw new Error(
    `Series ${seriesId} still reported more sessions after ${MAX_PAGES} pages, ` +
      `so it would be published incomplete`,
  );
}

module.exports = {
  getSeriesId,
  fetchSeriesSessions,
};
