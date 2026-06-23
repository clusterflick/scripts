const cheerio = require("cheerio");
const { fetchText, fetchJson } = require("../../common/utils");

const GRAPHQL_URL = "https://api.thecliq.app/graphql";
const clubPageUrl = (slug) => `https://www.thecliq.app/club/${slug}`;

// CLIQ originally exposed an unauthenticated GraphQL API, but it now gates
// anonymous access (the public `service-foo` token) by operation name — only a
// fixed allow-list of named operations is permitted, and the name is read from
// the request body's `operationName`, not the query string. The `clubs` and
// `clubEventsV3` operations we used to enumerate events are no longer reachable,
// but `EventDetail` still is.
//
// So we enumerate each club's upcoming events from the JSON-LD embedded in its
// server-rendered public club page, then hydrate each event through the still
// allowed `EventDetail` operation.
const CLUB_SLUGS = [
  "cinebug",
  "frame-by-frame",
  "the-film-club",
  "kingston-film-club",
  "film-night",
];

const EVENT_DETAIL_FIELDS = `
  event_id
  name
  slug
  start_time
  end_time
  description
  status
  online
  location {
    name
    address
    latitude
    longitude
  }
`;

async function queryEventDetail(query) {
  // operationName must be sent explicitly — the anonymous-access gate reads it
  // from the body and rejects anything outside its allow-list.
  return fetchJson(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "service-foo",
    },
    body: JSON.stringify({ operationName: "EventDetail", query }),
  });
}

// Pull the club name and upcoming-event slugs out of the schema.org JSON-LD that
// the club page server-renders. Upcoming events are listed in the Organization's
// `event` array; past events are not included.
function parseClubPage(html, slug) {
  const $ = cheerio.load(html);

  let organisation = null;
  $('script[type="application/ld+json"]').each((_, element) => {
    const json = JSON.parse($(element).contents().text());
    if (json["@type"] === "Organization") {
      organisation = json;
    }
  });

  if (!organisation) {
    throw new Error(
      `No Organization JSON-LD found on club page for "${slug}" — the page structure may have changed`,
    );
  }

  const eventSlugs = (organisation.event || []).map((event) => {
    const eventSlug = event.url?.split("/event/")[1];
    if (!eventSlug) {
      throw new Error(
        `Could not extract event slug from URL "${event.url}" on club "${slug}"`,
      );
    }
    return eventSlug;
  });

  return { name: organisation.name, eventSlugs };
}

// Hydrate every event in a single batched EventDetail request using aliases.
async function fetchEventDetails(eventSlugs) {
  if (eventSlugs.length === 0) return [];

  const aliasedQueries = eventSlugs
    .map(
      (eventSlug, i) =>
        `event${i}: eventDetail(event_id: ${JSON.stringify(eventSlug)}) { ${EVENT_DETAIL_FIELDS} }`,
    )
    .join(" ");

  const data = await queryEventDetail(
    `query EventDetail { ${aliasedQueries} }`,
  );
  return Object.values(data?.data ?? {}).filter(Boolean);
}

async function retrieve() {
  const clubs = {};
  const eventSlugToClubSlug = {};

  for (const slug of CLUB_SLUGS) {
    const html = await fetchText(clubPageUrl(slug));
    const { name, eventSlugs } = parseClubPage(html, slug);

    clubs[slug] = { slug, name, events: [] };
    for (const eventSlug of eventSlugs) {
      eventSlugToClubSlug[eventSlug] = slug;
    }
  }

  const details = await fetchEventDetails(Object.keys(eventSlugToClubSlug));

  for (const event of details) {
    const clubSlug = eventSlugToClubSlug[event.slug];
    clubs[clubSlug].events.push(event);
  }

  return { clubs };
}

module.exports = retrieve;
