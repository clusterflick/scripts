const knownRemovablePhrases = require("./known-removable-phrases.json");
const standardizePrefixingForTheatrePerformances = require("./standardize-prefixing-for-theatre-performances");

function normalizeTitle(title, options) {
  title = standardizePrefixingForTheatrePerformances(
    title,
    options,
  ).toLowerCase();

  if (title === "seven") return "se7en";

  const removablePrefixes = [
    "Scared To Dance -",
    "Hitchcock: The Gainsborough Days -",
    "Bar Screening x Muse:",
    "Kung Fu Cinema:",
    "a Preview Screening of",
    "Preview Screening of",
    "70th anniversary screening:",
    "uk premiere of:",
    "member library lates:",
    "Carer's & Babies Club:",
    "carers & babies club:",
    "Valentine’s Day Preview:",
    "Sky Original -",
    "- Part ",
    "Bar Trash: Season Launch:",
    "CELLULOID JAM! –",
    "Pierre Boulez - ",
    "+ LIVE RECORDING OF ‘PAST PRESENT FUTURE’ PODCAST WITH DAVID RUNCIMAN & HELEN LEWIS",
  ];

  title = title
    .replace('twin peaks - ', 'twin peaks ');

  removablePrefixes.forEach((phrase) => {
    title = title.replace(phrase.toLowerCase(), "");
  });

  const hasPresents = title.match(/\s+presents?:?\s+(.*?)$/i);
  if (hasPresents) {
    title = hasPresents[1];
  }

  const hasPresented = title.match(/^(.*?)\s+presented\s+/i);
  if (hasPresented) {
    title = hasPresented[1];
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

  knownRemovablePhrases.forEach((phrase) => {
    title = title.replace(phrase.toLowerCase(), "");
  });

  const hasYear = title.trim().match(/\(\d{4}\)$/);
  if (!hasYear) {
    title = title.replace(/\([^(]*\)$/, "").trim();
    title = title.replace(/\([^(]*\)$/, "").trim(); // Do it twice in case there's more paraenthesis
  }

  return (
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s*:\s+/g, ": ")
      .trim()
      .replace(/\s+and\s+/gi, " ")
      .replace(/\s+&\s+/gi, " ")
      .replace(/:$/, "")
      .replace(/'|’|"/g, "")
      .replace(/\s+(-|–)(\s|$)/g, " ")
      .replace(/:/g, "")
      .replace(/\s+/g, " ")
      // Mismatches between cinema listings and themoviedb
      .replace("vasthunnam", "vasthunam")
      .replace("eftihia", "eftyhia")
      .replace("10180", "1080")
      .replace("unknwon", "unknown")
      .replace("frozen 2", "frozen ii")
      .replace("behaviour", "behavior")
      .replace(/^fire walk with me$/, "twin peaks fire walk with me")
      .replace(/^(.+),\s+the$/, "the $1")
      .trim()
  );
}

module.exports = normalizeTitle;
