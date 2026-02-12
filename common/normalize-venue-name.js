const normalizeName = require("./normalize-name");

function normalizeVenueName(venueName) {
  return normalizeName(
    venueName
      .replace("Cinema London", "")
      .replace(" - London", "")
      .replace("London", "")
      .replace("Cinema,", "")
      .replace("Cinema", "")
      .replace(/^The /i, "")
      .trim(),
  );
}

module.exports = normalizeVenueName;
