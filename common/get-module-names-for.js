const path = require("node:path");
const fs = require("node:fs");

function getModuleNamesFor(directory) {
  const srcpath = path.join(".", directory);
  return fs
    .readdirSync(srcpath)
    .filter((file) => fs.statSync(path.join(srcpath, file)).isDirectory());
}

module.exports = getModuleNamesFor;
