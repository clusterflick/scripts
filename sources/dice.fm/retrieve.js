const { fetchJson, basicNormalize } = require("../../common/utils.js");

const searchUrl = "https://api.dice.fm/unified_search";
const eventUrl = (id) => `https://api.dice.fm/events/${id}`;
const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-Client-Timezone": "Europe/London",
  "X-Api-Timestamp": "2024-03-25",
};

// Search results are trimmed down to what a listing card needs — no perm_name,
// promoter, description or venue coordinates — so they only decide which events
// are worth fetching in full.
const getSummariesFromResponse = (response) =>
  response.sections
    .filter((section) => section.section_type === "polymorphic_vertical")
    .flatMap((section) => section.items ?? [])
    .filter((item) => item.type === "event")
    .map((item) => item.event);

const fetchSummaries = async (tag) => {
  const allSummaries = [];
  let cursor;

  do {
    const body = { count: 100, lat: 51.507653, lng: -0.107722, tag };
    if (cursor) body.cursor = cursor;

    const response = await fetchJson(searchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    allSummaries.push(...getSummariesFromResponse(response));
    cursor = response.next_page_cursor;
  } while (cursor);

  return allSummaries;
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
  const filmSummaries = await fetchSummaries("culture:film");

  // Every other tag is filtered down to a handful of events, so the film tag is
  // the only one whose emptiness is meaningful: London always has film events
  // on DICE, and an empty result means the search has stopped answering in the
  // shape we read rather than that there is nothing on.
  if (filmSummaries.length === 0) {
    throw new Error(
      'No events found under the "culture:film" tag — the DICE search response may have changed',
    );
  }

  const theatreSummaries = await fetchSummaries("culture:theatre");
  const filteredTheatreSummaries = theatreSummaries.filter((summary) =>
    nameContainsFilmKeyword(summary.name),
  );

  const gigSummaries = await fetchSummaries("music:gig");
  const filteredGigSummaries = gigSummaries.filter((summary) =>
    nameContainsFilmKeyword(summary.name),
  );

  const summaries = [
    ...filmSummaries,
    ...filteredTheatreSummaries,
    ...filteredGigSummaries,
  ];

  // An event can be listed under more than one tag, and it is the same event
  // each time, so de-duplicate before spending a request on each one.
  const eventIds = [...new Set(summaries.map(({ id }) => id))];

  const events = [];
  for (const id of eventIds) {
    events.push(await fetchJson(eventUrl(id), { headers }));
  }

  return { events };
}

module.exports = retrieve;
