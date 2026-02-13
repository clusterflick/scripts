const { fetchJson, basicNormalize } = require("../../common/utils.js");

const apiUrl = "https://api.dice.fm/unified_search";
const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-Client-Timezone": "Europe/London",
  "X-Api-Timestamp": "2024-03-25",
};

const getEventsFromResponse = (response) =>
  response.sections
    .filter((section) => section.section_type === "events_vertical")
    .flatMap((section) => section.events);

const fetchEvents = async (tag) => {
  const allEvents = [];
  let cursor;

  do {
    const body = { count: 100, lat: 51.507653, lng: -0.107722, tag };
    if (cursor) body.cursor = cursor;

    const response = await fetchJson(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const events = getEventsFromResponse(response);
    allEvents.push(...events);
    cursor = response.next_page_cursor;
  } while (cursor);

  return allEvents;
};

const nameContainsFilmKeyword = (name) => {
  const normalized = basicNormalize(name);
  return (
    normalized.includes("film") ||
    normalized.includes("movie") ||
    normalized.includes("screening") ||
    normalized.includes("soundtrack")
  );
};

async function retrieve() {
  const filmEvents = await fetchEvents("culture:film");

  const theatreEvents = await fetchEvents("culture:theatre");
  const filteredTheatreEvents = theatreEvents.filter((event) =>
    nameContainsFilmKeyword(event.name),
  );

  const gigEvents = await fetchEvents("music:gig");
  const filteredGigEvents = gigEvents.filter((event) =>
    nameContainsFilmKeyword(event.name),
  );

  const events = [
    ...filmEvents,
    ...filteredTheatreEvents,
    ...filteredGigEvents,
  ];

  return { events };
}

module.exports = retrieve;
