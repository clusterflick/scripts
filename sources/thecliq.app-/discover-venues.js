const { fetchJson, basicNormalize } = require("../../common/utils");
const { isInLondon } = require("../../common/geo-utils");
const {
  sortVenuesByEventCount,
  findMatchingCinema,
} = require("../../common/source-utils");
const { getAllCinemaAttributes } = require("../../cinemas");

const GRAPHQL_URL = "https://api.thecliq.app/graphql";
const CLUBS_QUERY = `query { clubs { clubId name slug } }`;

// How many clubs' event lists to request per batched GraphQL call. CLIQ has no
// way to pre-filter clubs to film, so discovery has to pull every club's events
// and inspect their locations. Aliasing many clubEventsV3 calls into a single
// request (mirroring retrieve.js) keeps this to a handful of round trips.
const CLUB_BATCH_SIZE = 75;

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

async function fetchAllClubEvents(clubs) {
  const events = [];

  for (let i = 0; i < clubs.length; i += CLUB_BATCH_SIZE) {
    const batch = clubs.slice(i, i + CLUB_BATCH_SIZE);
    const aliasedQueries = batch
      .map(
        (club, j) =>
          `c${j}: clubEventsV3(club_id: "${club.clubId}") {
            events { event_id name slug start_time online location { name address latitude longitude } }
          }`,
      )
      .join(" ");

    const data = await queryGraphQL(`query { ${aliasedQueries} }`);
    const result = data?.data ?? {};

    batch.forEach((club, j) => {
      const clubEvents = result[`c${j}`]?.events ?? [];
      for (const event of clubEvents) {
        events.push({ ...event, club });
      }
    });
  }

  return events;
}

async function discoverVenues() {
  const clubsData = await queryGraphQL(CLUBS_QUERY);
  const allClubs = clubsData?.data?.clubs ?? [];

  const events = await fetchAllClubEvents(allClubs);

  // Group events by physical venue using name + coordinates
  const venueMap = new Map();

  for (const event of events) {
    const location = event.location;
    // Online events and those without coordinates can't map to a cinema
    if (event.online || !location || location.latitude == null) continue;

    const coordinates = { lat: location.latitude, lon: location.longitude };
    const venueName = location.name;
    if (!venueName) continue;

    const venueKey = `${basicNormalize(venueName)}_${coordinates.lat}_${coordinates.lon}`;
    if (!venueMap.has(venueKey)) {
      venueMap.set(venueKey, {
        name: venueName,
        coordinates,
        address: location.address || null,
        events: [],
      });
    }
    venueMap.get(venueKey).events.push({
      url: `https://share.thecliq.app/event/${event.slug}`,
      venueName,
      coordinates,
      club: event.club.name,
    });
  }

  const knownCinemas = getAllCinemaAttributes();

  const results = [];
  for (const [, venue] of venueMap.entries()) {
    const matchingCinema = findMatchingCinema(
      knownCinemas,
      venue.name,
      venue.coordinates,
      { eventAddress: venue.address },
    );

    const inLondon = await isInLondon(
      venue.coordinates.lat,
      venue.coordinates.lon,
    );

    results.push({
      ...venue,
      inLondon,
      matchingCinema,
    });
  }

  return sortVenuesByEventCount(results);
}

module.exports = discoverVenues;
