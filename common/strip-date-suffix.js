/**
 * Some venues name a recurring strand after the sitting rather than the
 * strand: "The Blinking Buzzards – 10 July", "Exploding Cinema – 30th
 * October". normalizeTitle already drops the date, so every sitting combines
 * into one film - but the container then keeps the shortest member's title,
 * which names one date while listing the showings for all of them.
 *
 * Stripping the date leaves a title that's true of everything underneath it;
 * the specific date survives on each showing, which is what the performance
 * cards display. Same shape of problem as stripSerialBlockSuffix, and applied
 * in the same place.
 */

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const WEEKDAYS =
  "mon(?:day)?|tue(?:s)?(?:day)?|wed(?:nesday)?|thu(?:rs)?(?:day)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";
const ORDINAL = "(?:st|nd|rd|th)?";
const DAY = `\\d{1,2}${ORDINAL}`;

// A dash separator is required. Without it "Sunday Bloody Sunday" and any
// other title that merely ends on a month or a number is fair game, and the
// date being set off from the name is exactly what marks it as a listing
// detail rather than part of what the thing is called.
const dateSuffix = new RegExp(
  [
    "\\s*[-–—|]\\s*",
    `(?:(?:${WEEKDAYS})\\.?,?\\s+)?`,
    `(?:${DAY}\\s+(?:${MONTHS})|(?:${MONTHS})\\.?\\s+${DAY})`,
    `(?:,?\\s*\\d{4})?`,
    "\\s*$",
  ].join(""),
  "i",
);

function stripDateSuffix(title = "") {
  const stripped = title
    .replace(dateSuffix, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—:+|]\s*$/, "")
    .trim();

  // A listing that is nothing but a date has no name left to fall back on, so
  // it keeps the one it came with.
  return stripped || title;
}

module.exports = stripDateSuffix;
