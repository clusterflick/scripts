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

module.exports = getModuleNamesFor;
