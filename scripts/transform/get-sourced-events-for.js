const path = require("node:path");
const getModuleNamesFor = require("../../common/get-module-names-for");

async function getSourcedEventsFor(attributes) {
  const directoryPath = path.join(__dirname, "..", "..", "sources");
  const sources = await getModuleNamesFor(directoryPath);
  const sourcedEvents = {};
  for (const source of sources) {
    const { findEvents } = require(path.join(directoryPath, source));
    sourcedEvents[source] = await findEvents(attributes);
  }
  return sourcedEvents;
}

module.exports = getSourcedEventsFor;
