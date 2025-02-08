const fs = require("node:fs").promises;
const path = require("node:path");

async function getModuleNamesFor(directoryPath) {
  return (
    await Promise.all(
      (await fs.readdir(directoryPath)).map(async (file) => {
        const stats = await fs.stat(path.join(directoryPath, file));
        return stats.isDirectory() ? file : null;
      }),
    )
  ).filter(Boolean);
}

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
