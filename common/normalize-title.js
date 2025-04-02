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
    [/^LD:/i, "LD Friendly:"],
    // Remove prefix separators which will cause later processing to strip the wrong section
    ["Rafadan Tayfa - Kapadokya", "Rafadan Tayfa: Kapadokya"],
    ["Closing Night + Awards", "Closing Night and Awards"],
    ["Poetry Slam", "Event: Poetry Slam"],
    ["Scared To Dance -", "Scared To Dance "],
    ["Hitchcock: The Gainsborough Days -", "Hitchcock: The Gainsborough Days "],
    ["Sky Original -", "Sky Original "],
    ["Green Screen -", "Green Screen "],
    [/^SILVER\s*?SCREEN -/i, "SILVER SCREEN"],
    ["SUBTITLED -", "SUBTITLED "],
    [/^RELAXED -/i, "Relaxed screening: "],
    ["RELAXED Disney's", "Relaxed screening: Disney's"],
    ["Mamma Mia-", "Mamma Mia -"],
    ["CELLULOID JAM! –", "CELLULOID JAM! "],
    ["Saturday night at the movies -", "Saturday night at the movies:"],
    ["Pierre Boulez - Boulez", "Pierre Boulez "],
    ["twin peaks - ", "twin peaks "],
    ["- Part ", "Part "],
    ["- FREE ENTRY", "FREE ENTRY"],
    ["- Year of the Rabbit", "Year of the Rabbit"],
    ["- Live Arena Tour", "Live Arena Tour"],
    ["- Drunken Scorpion Presents ", "- Drunken Scorpion "],
    [/^Baby\s*?\+\s*?1:?\s+/i, "Baby & 1 "],
    [" + Short Film: ", " + Short Film "],
    ["- Celebrating", " - Celebrating"],
    ["- International", " - International"],
    ["Björk’s", "Björk"],
    // Fix spelling which causes missed match
    [/^seven$/i, "se7en"],
    ["The Return The Return", "The Return"],
    [/\s+du$/i, ""], // Dubbed
    [/\s+su$/i, ""], // subbed
    ["Vasthunnam", "Vasthunam"],
    ["Melagaon", "Malegaon"],
    ["Carvaggio", "Caravaggio"],
    ["Eftihia", "Eftyhia"],
    ["10180", "1080"],
    ["unknwon", "unknown"],
    ["Frozen 2", "Frozen II"],
    [/\s+terminator 2$/i, " Terminator 2 Judgment Day"],
    [/^Relaxed Mufasa/i, "Relaxed screening: Mufasa"],
    ["behaviour", "behavior"],
    ["Lynch: Fire Walk With Me", "Lynch: Twin Peaks Fire Walk With Me"],
    ["War Paint: Woman at War", "War Paint: Women at War"],
    ["Big Night Out: New Moon", "Big Night Out: The Twilight Saga: New Moon"],
    ["David Lynch: The Short Films", "The Short Films of David Lynch"],
    ["Battleground + intro ", "Battlefield + intro "], // BFI gets the name of the movie wrong
    ["The Dawn of Impressionism", "Dawn of Impressionism"],
    [" - Paris, 1874", ": Paris 1874"],
    [" - Poets and Lovers", ": Poets and Lovers"],
    ["Last Supper Part 1", "Last Supper"],
    ["The Last Supper", "Last Supper"],
    ["Veera Dheera Sooran: Part 2", "Veera Dheera Sooran"],
    ["Mulholland Dr.", "Mulholland Drive"], // Otherwise we match the TV pilot of the same name
    ["W&G:", "Wallace & Gromit:"],
    [": Curse Of The Were-Rabbit", ": The Curse Of The Were-Rabbit"],
    ["14 Days (Girlfriend Intlo)", "14 Days Girlfriend Intlo"],
    ["SCSEVENTEEN", "SEVENTEEN"],
    ["Björk's", "Björk:"],
    ["Children’s Cinema", "The Notebook Children's Cinema"], // Stop this accidentally matching "Children in the Cinema"
    // Sanitise use of "PRESENT" which is confused with "X presents"
    ["‘PAST PRESENT FUTURE’ PODCAST", "‘PAST+PRESENT+FUTURE’ PODCAST"],
    ["seventeen [right here]", "seventeen right here"], // remove brackets from this band name
    ["Exclusive Screening of Highly Acclaimed Bengali Feature Film - ", ""],
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

  const hasRetrospectiveScreening = title.match(
    /\s+retrospective screening(?:\s+of|:|;)?\s+(.*?)$/i,
  );
  if (hasRetrospectiveScreening) {
    title = hasRetrospectiveScreening[1];
  }

  const hasClub = matchesOpenPrefix(title, "club");
  if (hasClub) {
    title = hasClub[1];
  }

  const hasScreen = matchesOpenPrefix(title, "on screen");
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

  const hasFundraiser = matchesStartingPrefix(title, "fundraiser");
  if (hasFundraiser) {
    title = hasFundraiser[1];
  }

  const hasSeparator = title.match(/^(.*?)\s+(?:\+|-|\/|\||•)\s*/);
  if (hasSeparator) {
    title = hasSeparator[1];
  }

  title = title.split(/ plus q(?:&|\+)a/i)[0];
  title = title.split(/ followed by q(?:&|\+)a/i)[0];

  const hasSquareBracketDate = title.trim().match(/^(.*?)\[(\d{4})\](.*?)$/);
  if (hasSquareBracketDate) {
    title = `${hasSquareBracketDate[1]}(${hasSquareBracketDate[2]})${hasSquareBracketDate[3]}`;
  }

  const hasBrackets = title.match(/^(.*?)\s+\[/);
  if (hasBrackets) {
    title = hasBrackets[1];
  }

  const hasSlavicPremier = title.match(/Кинопремиера на "([^"]+)" /i);
  if (hasSlavicPremier) {
    title = hasSlavicPremier[1];
  }

  const hasUkranianFilm = title.match(/Ukrainian Film "([^"]+)" /i);
  if (hasUkranianFilm) {
    title = hasUkranianFilm[1];
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
    .replace(/(?:\s+|^)&\s+/gi, " ")
    .replace(/:$/, "")
    .replace(/'|`|\u200B|‘|’|"|“|”/g, "")
    .replace(/\s+(-|–)(\s|$)/g, " ")
    .replace(/(-|–)$/g, "")
    .replace(/!|:|\./g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(.+),\s+the$/, "the $1")
    .trim()
    .replace(/^the /i, "")
    .trim();
}

module.exports = normalizeTitle;
