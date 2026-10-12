const { format } = require("date-fns");
const { fetchJson, fetchText } = require("../../common/utils");
const attributes = require("./attributes");
const seededVenues = require("./seeded-venues");

const SEARCH_URL = `${attributes.domain}/api/v1/events/search/`;

// The key Skiddle's own website sends with every search it makes, so these are
// the requests its "show more events" button makes rather than an API account
// of our own. It only opens the search - the single event endpoint answers it
// with "A valid API Key must be provided" - which is why the full description
// is read from each event's page instead.
const PUBLIC_KEY = "42f25";

// The London page's own search centre, as it sends it
const LONDON = { latitude: 51.513, longitude: -0.123 };
// Wide enough to take in the whole of Greater London rather than the 10 the
// London page defaults to; venue matching decides what belongs to whom.
const RADIUS = 20;

const PAGE_SIZE = 100;

/**
 * Run one search to the end and return every event it holds.
 *
 * Deliberately without the `collapse` the website asks for, which folds every
 * date of a listing into one result and would leave us a single performance of
 * a run of screenings.
 */
async function search(params) {
  const events = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = `${SEARCH_URL}?${new URLSearchParams({
      pub_key: PUBLIC_KEY,
      platform: "web",
      minDate: format(new Date(), "yyyy-MM-dd"),
      hidecancelled: 1,
      ...params,
      limit: PAGE_SIZE,
      offset,
    })}`;
    const response = await fetchJson(url);

    // A refused search still answers 200, with the reason in the body
    if (response.error !== 0) {
      throw new Error(
        `Skiddle search failed - ${response.errormessage} (${response.errorcode}) for ${url}`,
      );
    }

    events.push(...response.results);
    if (offset + PAGE_SIZE >= Number(response.totalcount)) break;
  }

  return events;
}

/**
 * Read an event from its own page.
 *
 * The page carries what the search result leaves out - the full description
 * rather than a one-line tagline - and its times without the "+00:00" the
 * search tacks on. That offset is wrong: an event the page shows starting at
 * 6pm on 17 October is searched as "2026-10-17T18:00:00+00:00", which is 7pm
 * in London.
 */
async function retrieveEvent(url) {
  const html = await fetchText(url);
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new Error(`No __NEXT_DATA__ found on ${url}`);
  }

  const { event } = JSON.parse(match[1]).props.pageProps;
  if (!event) {
    throw new Error(`No event data found on ${url}`);
  }
  return event;
}

async function retrieve() {
  // Skiddle files few events under film, so an empty search is a quiet week
  // rather than a sign the search has stopped answering - a refusal is caught
  // by the error check in `search`, not by counting.
  const filmEvents = await search({
    ...LONDON,
    radius: RADIUS,
    eventcode: "FILM",
  });

  const venueEvents = [];
  for (const venueId of seededVenues) {
    venueEvents.push(...(await search({ venueid: venueId })));
  }

  // A seeded venue's film nights turn up in both searches
  const eventUrls = [
    ...new Set([...filmEvents, ...venueEvents].map(({ link }) => link)),
  ];

  const events = [];
  for (const url of eventUrls) {
    events.push(await retrieveEvent(url));
  }

  return { events };
}

module.exports = retrieve;
