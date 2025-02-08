const yearMatcher = /(\d{4})/;
const yearRangeMatcher = /(\d{2})\d{2}-(\d{2})/;
const shortYearRangeMatcher = /\d{2}-(\d{2})/;
const yearSuffixMatcher = /\(\d{4}\)$/;
const ownerMatcher = /:\s+[^\s]+['|’]s/;

// Les Miserables
function standardizePrefixingForLesMiserablesPerformances(title) {
  // Cineworld Enfield have done a bad job with the title of this listing.
  // Replace it with what it should be.
  if (title === "Les Miserables (40th Anniversary)") {
    return "Les Misérables The Staged Concert";
  }

  // Remove the hyphen and "live" to compact the title into something that will
  // normalize well for searching.
  // E.g. "Les Misérables - The Staged Concert Live!"
  // will become "Les Misérables The Staged Concert"
  return title
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+Live!?(\s|$)/, " ")
    .trim();
}

// National Theatre
const nationalTheatrePrefixes = [/NT Live[:|\s]/i];

function standardizePrefixingForNationalTheatrePerformances(title) {
  title = title.replace(/\s+&\s+/, " and ").replace(/\s+-\s+/, ": ");

  let updatedPrefixTitle = nationalTheatrePrefixes.reduce(
    (value, prefix) => value.replace(prefix, "National Theatre Live: "),
    title,
  );

  return updatedPrefixTitle
    .replace(/\s+:\s+/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Metropolitan Opera
const metOperaPrefixes = [
  /Met Opera Encore[:|\s]/i,
  /Met Opera Live[:|\s]/i,
  /Met Opera Season[:|\s]/i,
  /Met Opera:/i,
  /The Met:/i,
  /The MET 2025:/i,
  /The Metropolitan Opera:/i,
];

function standardizePrefixingForMetropolitanOperaPerformances(title, options) {
  title = title.replace(/\s+&\s+/, " and ").replace(/\s+-\s+/, ": ");

  let updatedPrefixTitle = metOperaPrefixes.reduce(
    (value, prefix) => value.replace(prefix, "The Metropolitan Opera: "),
    title,
  );

  updatedPrefixTitle = updatedPrefixTitle.replace(ownerMatcher, ":");

  const yearRangeMatch = updatedPrefixTitle.match(yearRangeMatcher);
  if (yearRangeMatch) {
    updatedPrefixTitle = `${updatedPrefixTitle.replace(yearRangeMatcher, "")} (${yearRangeMatch[1]}${yearRangeMatch[2]})`;
  }

  const shortYearRangeMatch = updatedPrefixTitle.match(shortYearRangeMatcher);
  if (shortYearRangeMatch) {
    updatedPrefixTitle = `${updatedPrefixTitle.replace(shortYearRangeMatcher, "")} (20${shortYearRangeMatch[1]})`;
  }

  if (!options.retainYear) {
    updatedPrefixTitle = updatedPrefixTitle.replace(yearSuffixMatcher, "");
  }

  return updatedPrefixTitle
    .replace(/Live in HD/i, "")
    .replace(/\s+:\s+/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Royal Ballet and Opera
const rboPrefixes = [
  /RBO Encore[:|\s]/i,
  /RBO Live[:|\s]/i,
  /ROH Royal Opera Live[:|\s]/i,
  /Royal Opera Live[:|\s]/i,
  /Royal Ballet Live[:|\s]/i,
  /RBO[:|\s]/i,
  /Royal Ballet and Opera[:|\s]/i,
  /Royal Ballet & Opera[:|\s]/i,
  /Royal Opera House[:|\s]/i,
  /The Royal Ballet[:|\s]/i,
  /The Royal Opera[:|\s]/i,
  /RB&O Live:/i,
];

function standardizePrefixingForRoyalBalletOperaPerformances(title, options) {
  title = title
    .replace(/Captured Live /i, "")
    .replace(/Hoffman(\s|$)/i, "Hoffmann$1")
    .replace(/\s+&\s+/, " and ")
    .replace(/\s+-\s+/, ": ");

  let updatedPrefixTitle = rboPrefixes.reduce(
    (value, prefix) => value.replace(prefix, "RB&O Live: "),
    title,
  );

  updatedPrefixTitle = updatedPrefixTitle.replace(ownerMatcher, ":");

  const yearRangeMatch = updatedPrefixTitle.match(yearRangeMatcher);
  if (yearRangeMatch) {
    updatedPrefixTitle = `${updatedPrefixTitle.replace(yearRangeMatcher, "")} (${yearRangeMatch[1]}${yearRangeMatch[2]})`;
  }

  const shortYearRangeMatch = updatedPrefixTitle.match(shortYearRangeMatcher);
  if (shortYearRangeMatch) {
    updatedPrefixTitle = `${updatedPrefixTitle.replace(shortYearRangeMatcher, "")} (20${shortYearRangeMatch[1]})`;
  }

  const yearMatch = updatedPrefixTitle.match(yearMatcher);
  if (yearMatch) {
    updatedPrefixTitle = `${updatedPrefixTitle.replace(yearMatcher, "")} (${yearMatch[1]})`;
  }

  if (!options.retainYear) {
    updatedPrefixTitle = updatedPrefixTitle.replace(yearSuffixMatcher, "");
  }

  return updatedPrefixTitle
    .replace(/\s+:\s+/, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+and\s+/gi, " & ")
    .trim();
}

// ---

function standardizePrefixingForTheatrePerformances(
  title,
  options = { retainYear: false },
) {
  const lowercaseTitle = title.toLowerCase().trim();

  if (
    lowercaseTitle.startsWith("les misérables") ||
    lowercaseTitle.startsWith("les miserables")
  ) {
    return standardizePrefixingForLesMiserablesPerformances(title, options);
  }

  if (lowercaseTitle.startsWith("nt live:")) {
    return standardizePrefixingForNationalTheatrePerformances(title, options);
  }

  if (
    lowercaseTitle.startsWith("met opera") ||
    lowercaseTitle.startsWith("the met ") ||
    lowercaseTitle.startsWith("the met:") ||
    lowercaseTitle.startsWith("the metropolitan opera")
  ) {
    return standardizePrefixingForMetropolitanOperaPerformances(title, options);
  }

  if (
    lowercaseTitle.startsWith("rbo ") ||
    lowercaseTitle.startsWith("rbo:") ||
    lowercaseTitle.startsWith("royal opera") ||
    lowercaseTitle.startsWith("royal ballet") ||
    lowercaseTitle.startsWith("the royal opera") ||
    lowercaseTitle.startsWith("the royal ballet") ||
    lowercaseTitle.startsWith("roh royal opera")
  ) {
    return standardizePrefixingForRoyalBalletOperaPerformances(title, options);
  }

  return title;
}

module.exports = standardizePrefixingForTheatrePerformances;
