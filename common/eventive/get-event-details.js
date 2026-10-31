const parseDescription = require("./parse-description");

/**
 * The film an Eventive event is showing. An event carries a list because a
 * tenant can hang a livestream or a recorded intro off the same screening, so
 * the actual film is picked by type rather than by position.
 */
function getFilmMetadata(films) {
  if (!films || films.length === 0) return {};

  // Find the primary film (type: "film", not "livestream" or special events)
  const primaryFilm = films.find((f) => f.type === "film") || films[0];
  const { credits = {}, details = {}, description } = primaryFilm;

  return {
    year: details.year,
    // An event's end_time is the on-demand availability window rather than the
    // end of the screening - it routinely lands a day out - so the runtime is
    // the only trustworthy length.
    duration: details.runtime,
    classification: details.rating,
    directors: credits.director,
    actors: credits.cast,
    description: description ? parseDescription(description) : "",
  };
}

/**
 * Tags a tenant has chosen to show on the listing. Hidden tags are internal
 * bookkeeping, so only visible ones become categories.
 */
function extractCategories(event) {
  return (event.tags || []).reduce((categories, tag) => {
    if (tag.name && tag.visible) {
      return categories.concat(tag.name);
    }
    return categories;
  }, []);
}

/**
 * A tenant can sell an event's tickets on another site - Eventbrite, or the
 * box office of the cinema screening it - and Eventive then shows an "Order
 * Tickets" button that sends the visitor there. Such an event has no ticket
 * buckets of its own, so there is nothing to count seats in.
 */
function getExternalTicketsUrl(event) {
  return event.external_tickets_url || null;
}

/**
 * Where a performance is booked: the other site when tickets are sold there,
 * otherwise the event's own Eventive page.
 */
function getBookingUrl(event, eventUrl) {
  return getExternalTicketsUrl(event) || eventUrl;
}

function getTicketStatus(event) {
  // Tickets sold on another site have no buckets here, which would otherwise
  // read as every seat gone. Their availability is unknown to us, and unknown
  // is not the same claim as available, so no status is given at all.
  if (getExternalTicketsUrl(event)) return {};

  // Check if any public ticket bucket has seats remaining
  const publicBuckets = event.ticket_buckets?.filter((b) => b.public) || [];
  const hasSeatsAvailable = publicBuckets.some(
    (bucket) => bucket.unlimited || bucket.quantity_remaining > 0,
  );

  return {
    soldOut: !hasSeatsAvailable,
  };
}

module.exports = {
  getFilmMetadata,
  extractCategories,
  getTicketStatus,
  getBookingUrl,
};
