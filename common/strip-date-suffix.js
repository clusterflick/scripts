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
 *
 * A date with no dash before it is sometimes the sitting too - the Cinema
 * Museum holds Kennington Bioscope dates as "KB event Apr 7", "KB event Jun
 * 30" - but read from one title it can't be told from a film named for a date
 * ("September 5"). Like stripSharedPartSuffix, that is decided from the group:
 * it is only a sitting when the group holds more than one different date, so
 * it is dropped only then.
 */

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const WEEKDAYS =
  "mon(?:day)?|tue(?:s)?(?:day)?|wed(?:nesday)?|thu(?:rs)?(?:day)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";
const ORDINAL = "(?:st|nd|rd|th)?";
const DAY = `\\d{1,2}${ORDINAL}`;

// Read from one title, a dash separator is required. Without it "Sunday Bloody Sunday" and any
// other title that merely ends on a month or a number is fair game, and the
// date being set off from the name is exactly what marks it as a listing
// detail rather than part of what the thing is called.
const datePattern = (separator) =>
  new RegExp(
    [
      separator,
      `(?:(?:${WEEKDAYS})\\.?,?\\s+)?`,
      `(?:${DAY}\\s+(?:${MONTHS})|(?:${MONTHS})\\.?\\s+${DAY})`,
      `(?:,?\\s*\\d{4})?`,
      "\\s*$",
    ].join(""),
    "i",
  );
const dateSuffix = datePattern("\\s*[-–—|]\\s*");
const undashedDateSuffix = datePattern("\\s+");

const trailingUndashedDate = (title = "") => {
  const match = title.match(undashedDateSuffix);
  return match && match[0].trim().toLowerCase();
};

function stripDateSuffix(title = "", groupTitles = []) {
  let stripped = title.replace(dateSuffix, "");
  const dates = new Set(groupTitles.map(trailingUndashedDate).filter(Boolean));
  if (dates.size > 1) stripped = stripped.replace(undashedDateSuffix, "");
  stripped = stripped
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—:+|]\s*$/, "")
    .trim();

  // A listing that is nothing but a date has no name left to fall back on, so
  // it keeps the one it came with.
  return stripped || title;
}

module.exports = stripDateSuffix;
