const normalizeName = require("./normalize-name");

function normalizeVenueName(venueName) {
  return normalizeName(
    venueName
      .replace("Cinema London", "")
      .replace(" - London", "")
      .replace("London", "")
      .replace("Cinema,", ""),
  );
}

module.exports = normalizeVenueName;
