const normalizeName = require("./normalize-name");

function normalizeVenueName(venueName) {
  return normalizeName(
    venueName
      .replace("Cinema London", "")
      .replace(" - London", "")
      .replace("London", ""),
  );
}

module.exports = normalizeVenueName;
