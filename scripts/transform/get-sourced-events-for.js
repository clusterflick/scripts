const { getAllSourceNames, getSourceFindEvents } = require("../../sources");

async function getSourcedEventsFor(attributes) {
  const sources = getAllSourceNames();
  const sourcedEvents = {};
  for (const source of sources) {
    const findEvents = getSourceFindEvents(source);
    sourcedEvents[source] = await findEvents(attributes);
  }
  return sourcedEvents;
}

module.exports = getSourcedEventsFor;
