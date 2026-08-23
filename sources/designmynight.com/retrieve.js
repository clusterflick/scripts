const { fetchJson } = require("../../common/utils.js");
const { dailyCache } = require("../../common/cache.js");
const { format, addMonths } = require("date-fns");

const API_BASE_URL = "https://api-content.designmynight.com/search/occurrences";
const AVAILABILITY_API_URL =
  "https://ticketing.designmynight.com/api/events/availability";

const paramsForLondon = {
  region_id: "59ef1720e445807f4c267a14",
  type: "event",
};

// The search matches an event against any one of its type_of_event tags, so a
// screening tagged only "Pop-Up Cinema" - as the Rivoli Ballroom's Halloween
// run is - never appears under "Film Screenings". These are the only two
// cinema tags the search knows; it takes a tag's slug as well as its id, and
// the slug is the only handle we have for Pop-Up Cinema.
const movieEventTypes = ["film-screenings", "pop-up-cinema"];

// The availability endpoint fails roughly half its requests with a 500, at
// random: probing one event id 36 times returned 500 for 16 of them, with no
// relationship to how fast the requests were sent (12 requests back to back
// failed 8 times, the same 12 spaced a second apart failed twice, spaced three
// seconds apart failed six times). Every id that failed answered 200 on a
// retry moments later, so this is a flaky backend rather than throttling or a
// broken event — pacing the loop wouldn't help, and a retry almost always
// does. A 500 stays permanent everywhere else; widen it here only.
//
// The budget is deliberately many short retries rather than a few long ones.
// Each attempt is an independent coin flip, so re-rolling is what recovers the
// request; waiting longer between rolls only costs wall-clock. A run makes a
// few hundred of these calls, and any single one exhausting its budget fails
// the whole retrieve, so the per-request failure odds have to be tiny.
const AVAILABILITY_RETRY_CONFIG = {
  retries: 10,
  delayMs: 2_000,
  retryStatuses: [500],
};

// Wrap every request in the daily cache, so a run killed partway through - by a
// request that exhausts the budget above, or a timeout - replays what it has
// already fetched on the nick-fields/retry rerun and resumes where it stopped,
// instead of paying for the whole crawl again. Keyed per request: the search is
// keyed by tag and page, availability by the event and month it asks about.
const getSearchPage = (typeOfEvent, page) => {
  const params = new URLSearchParams({
    page,
    ...paramsForLondon,
    type_of_event: typeOfEvent,
  });
  return dailyCache(`designmynight-search-${typeOfEvent}-${page}`, () =>
    fetchJson(`${API_BASE_URL}?${params}`),
  );
};

const getAvailability = (eventId, date) =>
  dailyCache(`designmynight-availability-${eventId}-${date}`, () =>
    fetchJson(
      AVAILABILITY_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: date,
          eventId: eventId,
          skipSoldOutDates: false,
        }),
      },
      AVAILABILITY_RETRY_CONFIG,
    ),
  );

async function retrieve() {
  let movieListPages = [];

  for (const typeOfEvent of movieEventTypes) {
    let page = 1;
    let lastPage = 1;

    while (page <= lastPage) {
      const pageData = await getSearchPage(typeOfEvent, page);

      lastPage = pageData.meta.last_page;
      movieListPages = movieListPages.concat(pageData.payload);
      page++;
    }
  }

  const eventIds = [
    ...new Set(movieListPages.map((event) => event.designmynight_id)),
  ];

  // Generate 12 months of dates starting from current month
  const dates = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = addMonths(now, i);
    dates.push(format(date, "yyyy-MM-01"));
  }

  // Fetch availability data for each event ID and date
  const moviePages = {};

  for (const eventId of eventIds) {
    for (const date of dates) {
      const response = await getAvailability(eventId, date);

      // Skip cancelled events which don't have any occurrences
      if (!response.occurrences) break;

      if (!moviePages[eventId]) {
        moviePages[eventId] = response;
      } else {
        const event = moviePages[eventId];
        moviePages[eventId].occurrences = event.occurrences.concat(
          response.occurrences,
        );
        const createOccurrenceKey = ({ id, date, start_time: time }) =>
          `${id}-${date}-${time}`;
        moviePages[eventId].occurrences = moviePages[
          eventId
        ].occurrences.filter(
          (occurrence, index, self) =>
            index ===
            self.findIndex(
              (compared) =>
                createOccurrenceKey(occurrence) ===
                createOccurrenceKey(compared),
            ),
        );
      }

      // Stop requesting if we have all the occurrences
      const event = moviePages[eventId];
      if (event && event.occurrences.length === event.total_occurrences) {
        break;
      }
    }
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;
