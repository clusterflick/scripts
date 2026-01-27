const sourceOnlyTransform = require("../../common/source-only/transform");
const normalizeTitle = require("../../common/normalize-title");

// Venue clarifications with release years (valid until end of March 2026)
const titleYears = {
  [normalizeTitle("Nosferatu")]: 1922,
  [normalizeTitle("Black Sunday")]: 1960,
  [normalizeTitle("Fear Street Trilogy")]: 2021,
  [normalizeTitle("Suspiria")]: 1977,
  [normalizeTitle("The Witch")]: 2015,
};

async function transform(data, sourcedEvents) {
  const events = await sourceOnlyTransform(data, sourcedEvents);

  return events.map((event) => {
    // Augment events with year information (until end of March 2026)
    if (new Date() < new Date("2026-04-01")) {
      const year = titleYears[normalizeTitle(event.title)];
      if (year) {
        event.overview = event.overview || {};
        event.overview.year = `${year}`;
      }
    }

    return event;
  });
}

module.exports = transform;
