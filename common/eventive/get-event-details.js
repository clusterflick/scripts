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

function getTicketStatus(event) {
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
};
