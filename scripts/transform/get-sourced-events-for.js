const fs = require("node:fs").promises;
const path = require("node:path");

async function getModuleNamesFor(directory) {
  const srcpath = path.join(".", directory);
  return (
    await Promise.all(
      (await fs.readdir(srcpath)).map(async (file) => {
        const stats = await fs.stat(path.join(srcpath, file));
        return stats.isDirectory() ? file : null;
      }),
    )
  ).filter(Boolean);
}

async function getSourcedEventsFor(attributes) {
  const sources = await getModuleNamesFor("sources");
  const sourcedEvents = {};
  for (source of sources) {
    const { findEvents } = require(`../sources/${source}`);
    sourcedEvents[source] = await findEvents(attributes);
  }
  return sourcedEvents;
}

module.exports = getSourcedEventsFor;
