const { fetchJson, basicNormalize } = require("../../common/utils");

const GRAPHQL_URL = "https://api.thecliq.app/graphql";

const CLUB_NAMES = [
  "Cinebug",
  "FRAME BY FRAME",
  "The Film Club",
  "Girls Who Walk | London",
];

const CLUBS_QUERY = `query { clubs { clubId name slug } }`;

const CLUB_EVENTS_QUERY = `query ($clubId: String!) {
  clubEventsV3(club_id: $clubId) {
    total_events
    events {
      event_id
      name
      slug
      image
      start_time
      end_time
      timezone
      location {
        name
        address
        latitude
        longitude
      }
      price
      free
      online
      is_sold_out
      selling_status
      member_count
      is_bookmarked
    }
    next_cursor
  }
}`;

async function queryGraphQL(query, variables) {
  return fetchJson(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "service-foo",
    },
    body: JSON.stringify({ query, variables }),
  });
}

async function retrieve() {
  const clubsData = await queryGraphQL(CLUBS_QUERY);
  const allClubs = clubsData?.data?.clubs ?? [];

  const matchedClubs = CLUB_NAMES.map((name) => {
    const club = allClubs.find(
      (c) => basicNormalize(c.name) === basicNormalize(name),
    );
    if (!club) {
      throw new Error(`Club not found: "${name}"`);
    }
    return club;
  });

  const clubs = {};
  const allEventIds = [];

  for (const club of matchedClubs) {
    const data = await queryGraphQL(CLUB_EVENTS_QUERY, {
      clubId: club.clubId,
    });
    const clubData = data?.data?.clubEventsV3 || {};
    clubs[club.clubId] = {
      ...club,
      ...clubData,
    };
    for (const event of clubData.events || []) {
      allEventIds.push(event.event_id);
    }
  }

  // Fetch all event details in a single batched GraphQL request using aliases
  const aliasedQueries = allEventIds
    .map(
      (id, i) =>
        `event${i}: eventDetail(event_id: "${id}") { event_id description }`,
    )
    .join(" ");
  const detailsData = await queryGraphQL(`query { ${aliasedQueries} }`);
  const details = detailsData?.data ?? {};

  // Merge descriptions back into club events
  for (const club of Object.values(clubs)) {
    for (const event of club.events || []) {
      const detail = Object.values(details).find(
        (d) => d?.event_id === event.event_id,
      );
      if (detail) {
        event.description = detail.description;
      }
    }
  }

  return { clubs };
}

module.exports = retrieve;
