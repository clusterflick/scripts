const normalizeName = require("./normalize-name");

// Ticketing platforms often name the screen alongside the venue - "The Garden
// Cinema (Screen 3)", "Rich Mix - Screen 2" - which tells us nothing about
// which venue it is. The digit is required so that venues genuinely called
// "Screen on the Green" or "The Soho Screening Rooms" are left alone. Any
// bracket or dash left behind is dropped by normalizeName.
const SCREEN_NUMBER = /\s*[([-]?\s*\bscreen\s+\d+\b\s*[)\]]?/gi;

function normalizeVenueName(venueName) {
  return normalizeName(
    venueName
      .replace(SCREEN_NUMBER, "")
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
