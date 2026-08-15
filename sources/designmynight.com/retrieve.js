const { fetchJson } = require("../../common/utils.js");
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

async function retrieve() {
  let movieListPages = [];

  for (const typeOfEvent of movieEventTypes) {
    let page = 1;
    let lastPage = 1;

    while (page <= lastPage) {
      const params = new URLSearchParams({
        page,
        ...paramsForLondon,
        type_of_event: typeOfEvent,
      });
      const url = `${API_BASE_URL}?${params}`;
      const pageData = await fetchJson(url);

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
      const response = await fetchJson(AVAILABILITY_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: date,
          eventId: eventId,
          skipSoldOutDates: false,
        }),
      });

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
