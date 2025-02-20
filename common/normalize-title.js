const knownRemovablePhrases = require("./known-removable-phrases");
const standardizePrefixingForTheatrePerformances = require("./standardize-prefixing-for-theatre-performances");

const matchesOpenPrefix = (title, phrase) =>
  title.match(new RegExp(`\\s+${phrase}[:;]\\s+(.*?)$`, "i"));

const matchesStartingPrefix = (title, phrase) =>
  title.match(new RegExp(`(?:^|\\s+)${phrase}[:;]\\s+(.*?)$`, "i"));

function normalizeTitle(title, options) {
  title = standardizePrefixingForTheatrePerformances(
    title,
    options,
  ).toLowerCase();

  // Specific corrections
  const corrections = [
    // Remove prefix separators which will cause later processing to strip the wrong section
    ["Scared To Dance -", "Scared To Dance "],
    ["Hitchcock: The Gainsborough Days -", "Hitchcock: The Gainsborough Days "],
    ["Sky Original -", "Sky Original "],
    ["CELLULOID JAM! –", "CELLULOID JAM! "],
    ["Pierre Boulez - Boulez", "Pierre Boulez "],
    ["twin peaks - ", "twin peaks "],
    ["- Part ", "Part "],
    ["- FREE ENTRY", "FREE ENTRY"],
    // Fix spelling which causes missed match
    [/^seven$/i, "se7en"],
    ["Vasthunnam", "Vasthunam"],
    ["Eftihia", "Eftyhia"],
    ["10180", "1080"],
    ["unknwon", "unknown"],
    ["Frozen 2", "Frozen II"],
    ["behaviour", "behavior"],
    ["Lynch: Fire Walk With Me", "Lynch: Twin Peaks Fire Walk With Me"],
    ["Big Night Out: New Moon", "Big Night Out: The Twilight Saga: New Moon"],
    [" - Paris, 1874", ": Paris 1874"],
    [" - Poets and Lovers", ": Poets and Lovers"],
    // Sanitise use of "PRESENT" which is confused with "X presents"
    ["‘PAST PRESENT FUTURE’ PODCAST", "‘PAST+PRESENT+FUTURE’ PODCAST"],
  ];

  corrections.forEach(([phrase, replacement]) => {
    title = title.replace(
      typeof phrase === "string" ? phrase.toLowerCase() : phrase,
      replacement.toLowerCase(),
    );
  });

  const hasPresents = title.match(/\s+presents?:?\s+(.*?)$/i);
  if (hasPresents) {
    title = hasPresents[1];
  }

  const hasPresented = title.match(/^(.*?)\s+presented\s+/i);
  if (hasPresented) {
    title = hasPresented[1];
  }

  const hasPremiere = title.match(/(?:^|\s+)premiere(?:\s+of|:|;)\s+(.*?)$/i);
  if (hasPremiere) {
    title = hasPremiere[1];
  }

  const hasScreenings = title.match(/\s+screenings?(?:\s+of|:|;)\s+(.*?)$/i);
  if (hasScreenings) {
    title = hasScreenings[1];
  }

  const hasClub = matchesOpenPrefix(title, "club");
  if (hasClub) {
    title = hasClub[1];
  }

  const hasScreen = matchesOpenPrefix(title, "screen");
  if (hasScreen) {
    title = hasScreen[1];
  }

  const hasTalk = matchesOpenPrefix(title, "talk");
  if (hasTalk) {
    title = hasTalk[1];
  }

  const hasNight = matchesOpenPrefix(title, "night");
  if (hasNight) {
    title = hasNight[1];
  }

  const hasFestival = matchesOpenPrefix(title, "festival");
  if (hasFestival) {
    title = hasFestival[1];
  }

  const hasGala = matchesOpenPrefix(title, "gala");
  if (hasGala) {
    title = hasGala[1];
  }

  const hasSpecial = matchesOpenPrefix(title, "special");
  if (hasSpecial) {
    title = hasSpecial[1];
  }

  const hasPreview = matchesOpenPrefix(title, "previews?");
  if (hasPreview) {
    title = hasPreview[1];
  }

  const hasMatinee = matchesOpenPrefix(title, "matinee");
  if (hasMatinee) {
    title = hasMatinee[1];
  }

  const hasSeason = matchesOpenPrefix(title, "season");
  if (hasSeason) {
    title = hasSeason[1];
  }

  const hasFilm = matchesStartingPrefix(title, "film");
  if (hasFilm) {
    title = hasFilm[1];
  }

  const hasThrowback = matchesStartingPrefix(title, "throwback");
  if (hasThrowback) {
    title = hasThrowback[1];
  }

  const hasMember = matchesStartingPrefix(title, "member\\s+[^:;]+");
  if (hasMember) {
    title = hasMember[1];
  }

  const hasSeparator = title.match(/^(.*?)\s+(?:\+|-|\/|\||•)\s*/);
  if (hasSeparator) {
    title = hasSeparator[1];
  }

  const hasSquareBracketDate = title.trim().match(/^(.*?)\[(\d{4})\](.*?)$/);
  if (hasSquareBracketDate) {
    title = `${hasSquareBracketDate[1]}(${hasSquareBracketDate[2]})${hasSquareBracketDate[3]}`;
  }

  const hasBrackets = title.match(/^(.*?)\s+\[/);
  if (hasBrackets) {
    title = hasBrackets[1];
  }

  title = title.replace(/(^|\s+)\d+th anniversary( screenings?)?(\s+|$)/i, " ");

  knownRemovablePhrases.forEach((phrase) => {
    title = title.replace(phrase.toLowerCase(), "");
  });

  const hasYear = title.trim().match(/\(\d{4}\)$/);
  if (!hasYear) {
    title = title.replace(/\([^(]*\)$/, "").trim();
    title = title.replace(/\([^(]*\)$/, "").trim(); // Do it twice in case there's more paraenthesis
  }

  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*:\s+/g, ": ")
    .replace(/\s+and\s+/gi, " ")
    .replace(/\s+&\s+/gi, " ")
    .replace(/:$/, "")
    .replace(/'|’|"/g, "")
    .replace(/\s+(-|–)(\s|$)/g, " ")
    .replace(/:/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(.+),\s+the$/, "the $1")
    .trim();
}

module.exports = normalizeTitle;
