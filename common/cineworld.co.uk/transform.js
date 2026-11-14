const { removeAlreadyListedPerformances } = require("../utils");
const boxofficeapiTransform = require("../boxofficeapi/transform");

// Cineworld's pages are on www.cineworld.co.uk, but every screening books on
// web.cineworld.co.uk. That is the venue's own host for telling its listings
// from a source's: two films can start at one time there, so a source's
// screening is only taken for one of them when the address is the same.
const BOOKING_DOMAIN = "https://web.cineworld.co.uk";

const accessibilityTags = {
  "showtime.accessibility.subtitled": { subtitled: true },
  "showtime.accessibility.audiodescription": { audioDescription: true },
  "showtime.accessibility.autismfriendly": { relaxed: true },
  "showtime.restriction.babyclub": { babyFriendly: true },
};

// Cineworld describes its auditorium and language tags in a paragraph of
// boilerplate apiece ("This screening uses laser projection rather than a
// conventional lamp-based projector. Laser systems are designed to ..."),
// repeated on every showing that carries them. Name the tag instead.
const tagNotes = {
  "format.projection.laser": "Laser projection",
  "auditorium.experience.infinityvision": "Infinity Vision",
  "auditorium.experience.superscreen": "Superscreen",
  "auditorium.comfort.recliners": "Recliner seating",
};

// "Localization.Language.Hindi" -> "Hindi language"
const getTagNote = (tag) => {
  const tagNote = tagNotes[tag.toLowerCase()];
  if (tagNote) return tagNote;

  const [, language] = tag.match(/^Localization\.Language\.([A-Za-z]+)$/) ?? [];
  if (language) {
    return `${language.replace(/([a-z])([A-Z])/g, "$1 $2")} language`;
  }

  return undefined;
};

async function transform(attributes, data, sourcedEvents) {
  const movies = await boxofficeapiTransform(
    attributes,
    data,
    { accessibilityTags, getTagNote },
    {},
  );

  // Sources that only link out to Cineworld's booking pages - Cinematik, for a
  // distributor's release - find screenings Cineworld already lists, at the
  // same address, so those copies are dropped. Anything a source finds that
  // Cineworld doesn't list stays.
  const listOfSourcedEvents = removeAlreadyListedPerformances(
    movies,
    Object.values(sourcedEvents).flatMap((events) => events),
    { venueDomain: BOOKING_DOMAIN },
  ).filter(({ performances }) => performances.length > 0);

  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
