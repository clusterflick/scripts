const boxofficeapiTransform = require("../boxofficeapi/transform");

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
  return boxofficeapiTransform(
    attributes,
    data,
    { accessibilityTags, getTagNote },
    sourcedEvents,
  );
}

module.exports = transform;
