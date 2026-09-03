const { domain } = require("./attributes");

// The venue's what's-on is served by one ajax call carrying every event with
// its performances - the token in the path is the site's own, not a session -
// and 500 is comfortably above the ninety-odd events it returns. Shared with
// the health probe, which reads the same call.
const LISTING_URL = `${domain}/ajax/filter_stream/ZWhHVEdwSDNuekJLUWI1OXVDQ0Fvdz09/?offset=0&limit=500`;

// Events carry a list of type ids; this is the one that means film.
const FILM_EVENT_TYPE = "101";

// Reject events which have no type set (which seem to be room hire), then check
// the type for the film event value.
const isFilmEvent = ({ event_type: eventType }) =>
  !!eventType && eventType.includes(FILM_EVENT_TYPE);

module.exports = { LISTING_URL, FILM_EVENT_TYPE, isFilmEvent };
