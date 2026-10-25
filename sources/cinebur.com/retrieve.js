const { startOfToday } = require("date-fns");
const auth = require("./auth");
const { documentPath, listDocuments, getDocuments } = require("./firestore");

// Only what a listing needs. Ticket stock is here for sold-out status; fees,
// commission and anything about the host beyond its name are left behind.
const EVENT_FIELDS = [
  "name",
  "description",
  "event_type",
  "event_date",
  "end_time",
  "film_name",
  "film_reference",
  "venue_reference",
  "host_name",
  "is_coming_soon",
  "ticket_availability",
  "total_capacity",
  "entry_tickets",
];
const VENUE_FIELDS = ["name", "address", "location"];
const FILM_FIELDS = [
  "name",
  "description",
  "director_name",
  "release_date",
  "runtime",
  "genre",
  "trailer_link",
];

async function retrieve() {
  const idToken = await auth.signIn();

  // Cinebur runs around a hundred events worldwide across its whole history,
  // so the collection is read whole and the past dropped here. Every country
  // is kept - venue matching decides what belongs to whom.
  const today = startOfToday();
  const events = (await listDocuments(idToken, "events", EVENT_FIELDS)).filter(
    ({ event_date }) => new Date(event_date) >= today,
  );

  const unique = (references) => [
    ...new Set(references.filter(Boolean).map(documentPath)),
  ];
  const venues = await getDocuments(
    idToken,
    unique(events.map(({ venue_reference }) => venue_reference)),
    VENUE_FIELDS,
  );
  const films = await getDocuments(
    idToken,
    unique(events.map(({ film_reference }) => film_reference)),
    FILM_FIELDS,
  );

  return {
    events: events.map(({ venue_reference, film_reference, ...event }) => ({
      ...event,
      venue: venue_reference ? venues[documentPath(venue_reference)] : null,
      film: film_reference ? films[documentPath(film_reference)] : null,
    })),
  };
}

module.exports = retrieve;
