const yearMatcher = /(\d{4})/;
const fullYearRangeMatcher = /(\d{4})[-|/](\d{4})/;
const yearRangeMatcher = /(\d{2})(\d{2})[-|/](\d{2})/;
const shortYearRangeMatcher = /(\d{2})[-|/](\d{2})/;
const yearSuffixMatcher = /\(\d{4}\)$/;
const ownerMatcher = /:\s+[^\s]+['|’]s/;
const getBaselineYear = () => new Date().getFullYear();

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
const nationalTheatreIndicator = [
  /NT Live Broadcast[:|\s]/i,
  /NT Live[:|\s]/i,
  /NT Encore[:|\s]/i,
  /National Theatre Live Presents/i,
  /National Theatre Presents/i,
  /National Theatre Live/i,
  /National Theatre[:|\s|$]/i,
  /: National Theatre$/i,
  /^NT: /i,
];

function standardizePrefixingForNationalTheatrePerformances(title) {
  title = title.replace(/\s+&\s+/, " and ").replace(/\s+-\s+/, ": ");

  let updatedTitle = nationalTheatreIndicator
    .reduce((value, prefix) => value.replace(prefix, " "), title)
    .replace(/Preview Screening/i, "")
    .replace(/Preview/i, "");

  return `National Theatre Live: ${updatedTitle}`
    .replace(/\s+:\s+/, " ")
    .replace(/\s+/g, " ")
    .replace(/\(\d{4}\)$/i, "")
    .replace(/\(\d{4}\s+encore\)$/i, "")
    .trim();
}

// Metropolitan Opera
const metOperaPrefixes = [
  /Met Opera Encore[:|\s]/i,
  /Met Opera Live in HD[:|\s]/i,
  /Met Opera Live[:|\s]/i,
  /Met Opera Season[:|\s]/i,
  /The Met Opera[:|\s]/i,
  /Met Opera[:|\s]/i,
  /The Met:? Live in HD[:|\s]/i,
  /The Met:? Live[:|\s]/i,
  /The Met[:|\s]/i,
  /Met:/i,
  /The Metropolitan Opera: RBO/i,
  /The Metropolitan Opera:/i,
  /La Scala \w+:/i,
  /(Matinee:\s+)?La Scala[:|\s]/i,
];

function standardizePrefixingForMetropolitanOperaPerformances(title) {
  title = title.replace(/\s+&\s+/, " and ").replace(/\s+-\s+/, ": ");

  // Update if "met opera" is a suffix
  if (
    title.toLowerCase().includes(": met opera") ||
    title.toLowerCase().includes(": the met opera") ||
    title.toLowerCase().includes(": metropolitan opera") ||
    title.toLowerCase().includes(": the metropolitan opera")
  ) {
    title = `The Metropolitan Opera: ${title.replace(/: (The )?Met(ropolitan)? Opera\s*/i, " ")}`;
  }

  let updatedPrefixTitle = metOperaPrefixes.reduce(
    (value, prefix) => value.replace(prefix, "The Metropolitan Opera: "),
    title,
  );

  updatedPrefixTitle = updatedPrefixTitle.replace(ownerMatcher, ":");

  let year = getBaselineYear();

  const fullYearRangeMatch = updatedPrefixTitle.match(fullYearRangeMatcher);
  if (fullYearRangeMatch) {
    year = fullYearRangeMatch[1];
    updatedPrefixTitle = updatedPrefixTitle.replace(fullYearRangeMatcher, "");
  }

  const yearRangeMatch = updatedPrefixTitle.match(yearRangeMatcher);
  if (yearRangeMatch) {
    year = `${yearRangeMatch[1]}${yearRangeMatch[2]}`;
    updatedPrefixTitle = updatedPrefixTitle.replace(yearRangeMatcher, "");
  }

  const shortYearRangeMatch = updatedPrefixTitle.match(shortYearRangeMatcher);
  if (shortYearRangeMatch) {
    year = `20${shortYearRangeMatch[1]}`;
    updatedPrefixTitle = updatedPrefixTitle.replace(shortYearRangeMatcher, "");
  }

  const yearSuffixMatch = updatedPrefixTitle.match(yearSuffixMatcher);
  if (yearSuffixMatch) {
    const yearSuffix = yearSuffixMatch[0].replaceAll(/[()]/g, "");
    const yearNumber = parseInt(yearSuffix, 10);
    const isFutureYear = yearNumber > getBaselineYear();
    year = isFutureYear ? `${yearNumber - 1}` : yearSuffix;
    updatedPrefixTitle = updatedPrefixTitle.replace(yearMatcher, "");
  }

  const yearMatch = updatedPrefixTitle.match(yearMatcher);
  if (yearMatch) {
    year = yearMatch[1];
    updatedPrefixTitle = updatedPrefixTitle.replace(yearMatcher, "");
  }

  // Add the year value in (either calcualted or defaulted to this year)
  const [before, ...after] = updatedPrefixTitle.split(":");
  updatedPrefixTitle = `${before} ${year}:${after.join(":")}`;

  // Remove any year value -- they can't be relied upon
  updatedPrefixTitle = updatedPrefixTitle.replace(yearSuffixMatcher, "");

  return updatedPrefixTitle
    .replace(/(\(\))+/, "")
    .replace(/Live in HD/i, "")
    .replace(/Season:/i, "")
    .replace(/\s+:\s+/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Royal Ballet and Opera
const rboPrefixes = [
  /RBO CINEMA SEASON/i,
  /RBO Encore[:|\s]/i,
  /RBO Live[:|\s]/i,
  /ROH Royal Opera Live[:|\s]/i,
  /ROH[:|\s]/i,
  /Royal Opera Live[:|\s]/i,
  /Royal Ballet Live[:|\s]/i,
  /RBO[:|\s]/i,
  /Royal Ballet and Opera Live[:|\s]/i,
  /Royal Ballet and Opera[:|\s]/i,
  /Royal Ballet & Opera Live[:|\s]/i,
  /Royal Ballet & Opera[:|\s]/i,
  /Royal Opera House[:|\s]/i,
  /^The Royal Ballet[:|\s]/i,
  /^The Royal Opera[:|\s]/i,
  /:( The)? Royal Ballet[:|\s]/i,
  /:( The)? Royal Opera[:|\s]/i,
  /:( The)? Royal Ballet$/i,
  /:( The)? Royal Opera$/i,
  /RB&O Live:/i,
  /RB&O:/i,
  /Live From Royal Ballet/i,
];

function standardizePrefixingForRoyalBalletOperaPerformances(title) {
  title = title
    .replace(/Captured Live /i, "")
    .replace(/-\s?Live\s?-/i, "-")
    .replace(/Hoffman(\s|$)/i, "Hoffmann$1")
    .replace(/\s+&\s+/, " and ")
    .replace(/\s+-\s+/, ": ");

  let updatedPrefixTitle = rboPrefixes.reduce(
    (value, prefix) => value.replace(prefix, ""),
    title,
  );

  updatedPrefixTitle = `Royal Ballet & Opera: ${updatedPrefixTitle}`.replace(
    ownerMatcher,
    ":",
  );

  let year = getBaselineYear();

  const fullYearRangeMatch = updatedPrefixTitle.match(fullYearRangeMatcher);
  if (fullYearRangeMatch) {
    year = fullYearRangeMatch[1];
    updatedPrefixTitle = updatedPrefixTitle.replace(fullYearRangeMatcher, "");
  }

  const yearRangeMatch = updatedPrefixTitle.match(yearRangeMatcher);
  if (yearRangeMatch) {
    year = `${yearRangeMatch[1]}${yearRangeMatch[2]}`;
    updatedPrefixTitle = updatedPrefixTitle.replace(yearRangeMatcher, "");
  }

  const shortYearRangeMatch = updatedPrefixTitle.match(shortYearRangeMatcher);
  if (shortYearRangeMatch) {
    year = `20${shortYearRangeMatch[1]}`;
    updatedPrefixTitle = updatedPrefixTitle.replace(shortYearRangeMatcher, "");
  }

  const yearSuffixMatch = updatedPrefixTitle.match(yearSuffixMatcher);
  if (yearSuffixMatch) {
    const yearSuffix = yearSuffixMatch[0].replaceAll(/[()]/g, "");
    const yearNumber = parseInt(yearSuffix, 10);
    const isFutureYear = yearNumber > getBaselineYear();
    year = isFutureYear ? `${yearNumber - 1}` : yearSuffix;
    updatedPrefixTitle = updatedPrefixTitle.replace(yearMatcher, "");
  }

  const yearMatch = updatedPrefixTitle.match(yearMatcher);
  if (yearMatch) {
    year = yearMatch[1];
    updatedPrefixTitle = updatedPrefixTitle.replace(yearMatcher, "");
  }

  // Add the year value in (either calcualted or defaulted to this year)
  const [before, ...after] = updatedPrefixTitle.split(":");
  updatedPrefixTitle = `${before} ${year}:${after.join(":")}`;

  // Remove any year value -- they can't be relied upon
  updatedPrefixTitle = updatedPrefixTitle.replace(yearSuffixMatcher, "");

  updatedPrefixTitle = updatedPrefixTitle
    .replace(/the\s+royal\s+opera:/i, "")
    .replace(/the\s+royal\s+ballet:/i, "");

  return updatedPrefixTitle
    .replace(/(\(\))+/, "")
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

  if (
    lowercaseTitle.match(/^nt: /i) ||
    lowercaseTitle.match(/(^|\s)nt live:?/i) ||
    lowercaseTitle.match(/(^|\s)nt encore:?/i) ||
    lowercaseTitle.startsWith("nt live broadcast:") ||
    lowercaseTitle.includes("national theatre")
  ) {
    return standardizePrefixingForNationalTheatrePerformances(title, options);
  }

  if (
    lowercaseTitle.startsWith("met opera") ||
    lowercaseTitle.startsWith("the met ") ||
    lowercaseTitle.startsWith("the met:") ||
    lowercaseTitle.startsWith("met:") ||
    lowercaseTitle.startsWith("la scala:") ||
    lowercaseTitle.startsWith("la scala ") ||
    lowercaseTitle.startsWith("matinee: la scala:") ||
    lowercaseTitle.startsWith("the metropolitan opera:") ||
    lowercaseTitle.startsWith("the metropolitan opera ") ||
    (lowercaseTitle.startsWith("rbo ") &&
      lowercaseTitle.includes("the metropolitan opera:")) ||
    (lowercaseTitle.startsWith("rbo ") &&
      lowercaseTitle.includes("the met opera -")) ||
    lowercaseTitle.includes(" - met opera") ||
    lowercaseTitle.includes(" - the met opera") ||
    lowercaseTitle.includes(": metropolitan opera")
  ) {
    return standardizePrefixingForMetropolitanOperaPerformances(title, options);
  }

  if (
    lowercaseTitle.startsWith("rb&o ") ||
    lowercaseTitle.startsWith("rb&o:") ||
    lowercaseTitle.startsWith("rbo ") ||
    lowercaseTitle.startsWith("rbo:") ||
    lowercaseTitle.startsWith("royal opera") ||
    lowercaseTitle.startsWith("royal ballet") ||
    lowercaseTitle.includes(": royal ballet") ||
    lowercaseTitle.startsWith("the royal opera") ||
    lowercaseTitle.includes(": royal opera") ||
    lowercaseTitle.includes("- the royal opera") ||
    lowercaseTitle.startsWith("the royal ballet") ||
    lowercaseTitle.includes("- the royal ballet") ||
    lowercaseTitle.startsWith("roh royal opera") ||
    lowercaseTitle.startsWith("roh ") ||
    lowercaseTitle.startsWith("roh: ") ||
    lowercaseTitle.includes("live from royal ballet")
  ) {
    return standardizePrefixingForRoyalBalletOperaPerformances(title, options);
  }

  return title;
}

module.exports = standardizePrefixingForTheatrePerformances;
