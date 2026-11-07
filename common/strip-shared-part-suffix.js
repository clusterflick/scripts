/**
 * A programme screened over several sittings is sometimes billed one part at a
 * time with the part on the end: "Film is Fabulous! Showcase + Discussion:
 * Recovered Part One" and "... Recovered Part Two". When normalizeTitle
 * combines them into one film, the container keeps one member's title, which
 * names one part while listing the showings for all of them.
 *
 * Unlike stripSerialBlockSuffix, this can't be decided from one title: a
 * trailing part is often the film's own name ("Dune: Part Two",
 * "Kaamelott: The Second Chapter (Part 1)"). It is only a sitting when the
 * combined group holds more than one part of the same title, so the part is
 * dropped only then. The specific part survives on each showing, which is what
 * the performance cards display.
 */

const PART_WORDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

const trailingPart = new RegExp(
  `\\s*[-–—:,]?\\s*\\(?\\bpart\\s+(\\d+|[ivx]+|${PART_WORDS.join("|")})\\)?\\s*$`,
  "i",
);

const ROMAN = { i: 1, v: 5, x: 10 };

function partNumber(part) {
  const lower = part.toLowerCase();
  if (/^\d+$/.test(lower)) return Number(lower);
  const word = PART_WORDS.indexOf(lower);
  if (word !== -1) return word + 1;
  return [...lower].reduce((total, char, index, chars) => {
    const value = ROMAN[char];
    const next = ROMAN[chars[index + 1]] || 0;
    return total + (value < next ? -value : value);
  }, 0);
}

function splitPart(title) {
  const match = title.match(trailingPart);
  if (!match) return null;
  return {
    base: title.slice(0, match.index).trim(),
    part: partNumber(match[1]),
  };
}

function stripSharedPartSuffix(title = "", groupTitles = []) {
  const container = splitPart(title);
  if (!container) return title;

  const members = groupTitles.map(splitPart);
  if (members.some((member) => !member)) return title;

  const sameBase = (member) =>
    member.base.toLowerCase() === container.base.toLowerCase();
  if (!members.every(sameBase)) return title;

  const parts = new Set(members.map(({ part }) => part));
  if (parts.size < 2) return title;

  return container.base.replace(/\s*[-–—:+]\s*$/, "").trim();
}

module.exports = stripSharedPartSuffix;
