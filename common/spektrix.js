const { fetchJson } = require("./utils");

// Shared helpers for venues ticketed by Spektrix. app.spektrix-link.com serves
// a single event's details along with its instances (performances) and live
// seat availability. It is not the client's own `tickets.<venue>` site, which
// sits behind bot protection that blocks non-browser clients outright.
const getEventBookingUrl = (client, eventId) =>
  `https://app.spektrix-link.com/clients/${client}/events/${eventId}.json`;

// Spektrix ids are a numeric web event id followed by an alphabetic suffix
// (e.g. "742730ABNJPTSBLMRSVBMPQQJLSDTTLRP"). The numeric part is the id used
// by the ticketing site and by the booking widgets embedded in venue pages, so
// it's what links a venue's listing page back to its Spektrix event.
const getWebEventId = (spektrixId) => {
  const match = `${spektrixId}`.match(/^(\d{6,7})/);
  return match ? match[1] : undefined;
};

const retrieveEventBooking = (client, eventId) =>
  fetchJson(getEventBookingUrl(client, eventId));

// Spektrix also publishes the whole client's catalogue: every event with its
// attributes, and every instance with the event it belongs to. A health probe
// can count a venue's whole run from these two calls, where a retrieve pays one
// booking call per event.
//
// Two traps. `startFrom` is honoured on `instances` and silently ignored on
// `events`, so the event list arrives whole however it is asked for - 2.5MB at
// a client covering a council's venues. And unlike the booking call, which
// answers with the instances still to come, these are the event's entire run
// including instances long past, so a caller counting what is on sale has to
// drop them itself.
const getEventsUrl = (client) =>
  `https://system.spektrix.com/${client}/api/v3/events`;

const getInstancesUrl = (client, startFrom) =>
  `https://system.spektrix.com/${client}/api/v3/instances?startFrom=${startFrom}`;

// An event's instances cover its whole run, including any the venue has
// cancelled. Cancelled instances aren't bookable and shouldn't be listed.
const getBookableInstances = (booking) =>
  booking.instances.filter(({ cancelled }) => !cancelled);

// Spektrix reports remaining seats rather than a sold-out flag, so no seats
// left is how a sold-out performance presents.
const isSoldOut = ({ availability }) => availability.available === 0;

module.exports = {
  getEventBookingUrl,
  getEventsUrl,
  getInstancesUrl,
  getWebEventId,
  retrieveEventBooking,
  getBookableInstances,
  isSoldOut,
};
