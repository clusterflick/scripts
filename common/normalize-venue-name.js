const normalizeName = require("./normalize-name");

function normalizeVenueName(venueName) {
  return normalizeName(
    venueName
      .toLowerCase()
      .replace("cinema london", "")
      .replace(" - london", "")
      .replace("london", "")
      .replace("cinema,", "")
      .replace("cinema", "")
      .trim(),
  );
}

module.exports = normalizeVenueName;
