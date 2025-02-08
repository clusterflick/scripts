async function transform(data, sourcedEvents) {
  // Return the sourced events for this venue
  return Object.values(sourcedEvents).flatMap((events) => events);
}

module.exports = transform;
