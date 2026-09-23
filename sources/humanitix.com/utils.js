function getEventUrl(event) {
  if (!event.hostname || !event.slug) {
    throw new Error(
      `humanitix event ${event._id} is missing hostname or slug for URL construction`,
    );
  }
  return new URL(event.slug, event.hostname).href;
}

module.exports = { getEventUrl };
