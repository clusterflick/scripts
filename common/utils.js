const crypto = require("node:crypto");
const fs = require("node:fs").promises;
const iconv = require("iconv-lite");
const { decode } = require("html-entities");
const { isAfter, startOfDay } = require("date-fns");
const stringify = require("json-stable-stringify");
const diff = require("fast-diff");

const readJSON = async (filePath) => {
  const data = await fs.readFile(filePath, "utf8");
  return JSON.parse(data);
};

const writeJSON = async (filePath, value) => {
  const data = stringify(value, { space: 2 });
  return await fs.writeFile(filePath, data);
};

const basicNormalize = (value = "") =>
  value.toLowerCase().replaceAll(",", "").replace(/\s+/g, " ").trim();

// Placeholder names that shouldn't be used for matching
const unhelpfulCrewNames = [
  /^various$/i,
  /^various\s+/i, // "Various Directors", "Various Mystery Directors", etc.
  /^tbc$/i,
  /^tba$/i,
  /^unknown$/i,
  /^n\/a$/i,
  /^none$/i,
  /^multiple$/i,
  /^multiple\s+/i, // "Multiple Directors", etc.
  /^mixed$/i,
  /^who knows/i, // "Who Knows?", etc.
  /collective$/i, // "Sake Collective", etc.
  /^the metropolitan opera$/i,
];

const isHelpfulCrewName = (name) =>
  !unhelpfulCrewNames.some((pattern) => pattern.test(name.trim()));

// Clean up crew names by removing common prefixes/suffixes
const cleanCrewName = (name) =>
  name
    .trim()
    .replace(/\s+\.$/g, "") // Remove trailing " ."
    .replace(/^award[- ]winning\s+(director|filmmaker)\s+/i, "") // "award-winning director X" -> "X"
    .trim();

const sanitizePathSegment = (value = "") => {
  return value
    .normalize("NFKC")
    .replace(/\0/g, "")
    .replace(/[/\\]+/g, "-") // replace separators
    .replace(/^[.\s]+/, "") // avoid hidden files / traversal
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "") // whitelist chars
    .slice(0, 255);
};

const sortAndFilterMovies = (movies) => {
  const startOfToday = startOfDay(new Date());

  const updatesMovies = movies.reduce((populatedMovies, movie) => {
    const performances = movie.performances
      .filter(({ time }) => isAfter(time, startOfToday))
      .sort((a, b) => a.time - b.time);

    // Remove movies which don't have any performances
    if (performances.length === 0) return populatedMovies;
    return populatedMovies.concat({ ...movie, performances });
  }, []);

  return updatesMovies.sort((a, b) => a.title.localeCompare(b.title));
};

const getMovieTitleAndYearFrom = (title) => {
  const hasYear = title.trim().match(/^(.*?)\s*\((\d{4})\)$/);
  if (hasYear)
    return {
      title: hasYear[1].trim(),
      year: hasYear[2],
    };
  return { title };
};

const convertToList = (value) => {
  if (!value) return [];
  const list = value
    .split(/,|\n|\||\/|&|;|•/g)
    .map((value) => value.replace(/\s+/g, " ").trim());
  return list.filter((item) => item !== "");
};

const splitConjoinedItemsInList = (list, joiner = " and ") => {
  return list.reduce(
    (updatedList, item) =>
      updatedList.concat(item.split(joiner).map((value) => value.trim())),
    [],
  );
};

const classifications = ["U", "PG", "12", "12A", "15", "18"];
const getValidClassification = (value = "") => {
  const sanitizedValue = (value ?? "")
    .toLowerCase()
    .replace("+", "")
    .replace("*", "")
    .replace(" certificate", "")
    .replace("advised ", "")
    .replace("r18", "18")
    .trim()
    .toUpperCase();
  return classifications.includes(sanitizedValue) ? sanitizedValue : undefined;
};

const parseMinsToMs = (value) => parseInt(value, 10) * 60 * 1000;

const sanitizeRichText = (value) =>
  decode(
    value
      .replaceAll("\\n", "\n")
      .replaceAll("\\", "")
      .replaceAll("<br />", "\n")
      .replaceAll("<br>", "\n")
      .replaceAll("<p>", "\n")
      .replaceAll("</p>", "\n")
      .replaceAll("<strong>", "")
      .replaceAll("</strong>", "")
      .replaceAll("<em>", "")
      .replaceAll("</em>", "")
      .replaceAll("<font>", "")
      .replaceAll("</font>", "")
      .replaceAll("<i>", "")
      .replaceAll("</i>", "")
      .replaceAll("<b>", "")
      .replaceAll("</b>", "")
      .replaceAll("<u>", "")
      .replaceAll("</u>", "")
      .replaceAll("<ul>", "")
      .replaceAll("</ul>", "")
      .replaceAll("<li>", "")
      .replaceAll("</li>", "")
      .replaceAll(/<span[^>]*>/gi, "")
      .replaceAll("</span>", "")
      .trim(),
  );

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async (
  fn,
  { retries = 1, delayMs = 30_000, label = "Operation" } = {},
) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        console.log(
          ` ! - ${label} failed (${error.message}), retrying in ${delayMs / 1000}s...`,
        );
        await sleep(delayMs);
      } else {
        console.log(` ! - ${label} failed (${error.message})`);
      }
    }
  }
  throw lastError;
};

const fetchWithRetry = async (
  url,
  options = {},
  { retries = 1, delayMs = 30_000 } = {},
) => {
  return withRetry(async () => fetch(url, options), {
    retries,
    delayMs,
    label: "Fetch",
  });
};

const fetchText = async (url, options) =>
  (await fetchWithRetry(url, options)).text();

const fetchWin1252Text = async (url) => {
  const response = await fetchWithRetry(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  return iconv.decode(buffer, "win1252");
};

const fetchJson = async (url, options) =>
  (await fetchWithRetry(url, options)).json();

const getText = ($el) => $el.text().trim();

const screenNumberMapping = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const getScreen = (screen) => {
  if (typeof screen !== "string" || !screen) return undefined;

  const screenNumber = screen
    .toLowerCase()
    .replace("screen", "")
    .replace("nft", "")
    .replace("kia", "")
    .replace("(unreserved)", "")
    .replace(/^s(\d+)$/i, "$1")
    .trim();

  const mappedScreenNumber = screenNumberMapping[screenNumber.toLowerCase()];
  if (mappedScreenNumber) return `${mappedScreenNumber}`;

  // If we couldn't condense the screen down to a number, it's probably got a
  // name like "Cinema 1" (Barbicon) or "Reuben Library" (BFI), so just return
  // the original value
  if (`${parseInt(screenNumber, 10)}` !== screenNumber) return screen;

  return screenNumber;
};

const createPerformance = ({
  date,
  notesList = [],
  url,
  screen,
  status = {},
  accessibility = {},
}) => ({
  time: date.getTime(),
  notes: notesList
    .map((value) => value?.trim())
    .filter((value) => !!value)
    .join("\n")
    .trim(),
  bookingUrl: typeof url === "function" ? url() : encodeURI(url),
  screen: getScreen(screen),
  status,
  accessibility,
});

const attemptEncodingFix = (value) => {
  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
};

const removeNotes = (value) => {
  // Remove role notes, e.g. "Meryl Streep (Narration)" -> "Meryl Streep"
  return value.replace(/\([^)]+\)$/i, "").trim();
};

const convertNamesTextToList = (names) =>
  splitConjoinedItemsInList(convertToList(names))
    .map(attemptEncodingFix)
    .map(removeNotes);

const createOverview = ({
  duration,
  year,
  categories = "",
  directors = "",
  actors = "",
  classification,
  trailer,
}) => {
  const processedDirectors = Array.isArray(directors)
    ? directors
    : convertNamesTextToList(directors);

  const processedActors = Array.isArray(actors)
    ? actors
    : convertNamesTextToList(actors);

  return {
    duration: parseMinsToMs(duration) || undefined,
    year: year || undefined,
    categories: Array.isArray(categories)
      ? categories
      : splitConjoinedItemsInList(convertToList(categories)),
    directors: processedDirectors.map(cleanCrewName).filter(isHelpfulCrewName),
    actors: processedActors.map(cleanCrewName).filter(isHelpfulCrewName),
    classification: getValidClassification(classification),
    trailer: trailer || undefined,
  };
};

const audioDescriptionMatchers = [
  /\bAD\b/, // "AD: Film Name" or "Film (AD)" — uppercase only to avoid false positives
  /Audio Descri/i, // "Audio Described", "Audio Description"
];

const relaxedMatchers = [
  /Relaxed Screen/i,
  /Relaxed Preview/i,
  /^Relaxed /i,
  /\(Relaxed\)/i,
];

const babyFriendlyMatchers = [
  /Parents? [&|+|and] Baby/i,
  /Baby\s*[&|+|and]\s*1/i,
  /Kids Club:/i,
  /Babykino:/i,
];

const subtitledMatchers = [
  /Subtitl?ed/i,
  /Subbed/i,
  /\(Sub\)/i,
  /Subs\)/i,
  /with Subtitles/i,
];

const hardOfHearingMatchers = [
  /Caption(?:ed)?/i,
  /\bHOH\b/i,
  /Hard of Hearing/i,
  /\bSDH\b/i,
  /\bBSL\b/i,
  /\bCC\b/,
  /\bOC\b/,
];

const getTitleAccessibility = (title) => {
  const titleAccessibility = {};
  if (audioDescriptionMatchers.some((matcher) => !!title.match(matcher))) {
    titleAccessibility.audioDescription = true;
  }
  if (relaxedMatchers.some((matcher) => !!title.match(matcher))) {
    titleAccessibility.relaxed = true;
  }
  if (babyFriendlyMatchers.some((matcher) => !!title.match(matcher))) {
    titleAccessibility.babyFriendly = true;
  }
  if (subtitledMatchers.some((matcher) => !!title.match(matcher))) {
    titleAccessibility.subtitled = true;
  }
  if (hardOfHearingMatchers.some((matcher) => !!title.match(matcher))) {
    titleAccessibility.hardOfHearing = true;
  }
  return titleAccessibility;
};

const descriptionAccessibilityMatchers = {
  audioDescription: [/(?:is |this |includes? )audio descri/i],
  relaxed: [/relaxed screening/i],
  babyFriendly: [/parent and baby/i, /parent & baby/i, /baby friendly/i],
  subtitled: [/with (?:english )?subtitles/i],
  hardOfHearing: [/\bwith captions\b/i, /\bcaptioned screening/i],
};

const descriptionNegationPattern =
  /\b(?:not|no|without|doesn't|does not|don't|do not|isn't|is not|won't|will not|cannot|can't|lack)\b/i;

const getDescriptionAccessibility = (description) => {
  if (!description) return {};
  const accessibility = {};
  for (const [key, matchers] of Object.entries(
    descriptionAccessibilityMatchers,
  )) {
    for (const matcher of matchers) {
      const match = description.match(matcher);
      if (!match) continue;
      // Check the 60 characters before the match for negation words
      const matchIndex = match.index;
      const preceding = description.slice(
        Math.max(0, matchIndex - 60),
        matchIndex,
      );
      if (descriptionNegationPattern.test(preceding)) continue;
      accessibility[key] = true;
      break;
    }
  }
  return accessibility;
};

const createAccessibility = (title, accessibility, description = "") => {
  const titleAccessibility = getTitleAccessibility(title.trim());
  const descriptionAccessibility = getDescriptionAccessibility(description);

  const listingAccessibility = Object.keys(accessibility).reduce(
    (mapping, key) => {
      if (!accessibility[key]) return mapping;
      return { ...mapping, [key]: true };
    },
    {},
  );

  return {
    ...descriptionAccessibility,
    ...titleAccessibility,
    ...listingAccessibility,
  };
};

// eslint-disable-next-line no-unused-vars
const removeMatchingHints = ({ matchingHints, ...movie }) => movie;

const addTestCategory = (movie) => ({ ...movie, category: "event" });

const compareAsSimilar = (firstString, secondString) => {
  if (firstString === secondString) return true;

  // Compare strings, calculating a score based on the number of characters that
  // have changed. The following counts the number of characters changed
  // (additions and deletions).
  const lettersChanges = diff(firstString, secondString).reduce(
    (count, [score, letters]) => (score === 0 ? count : count + letters.length),
    0,
  );
  // The threshold of 4 below allows for 2 characters to mismatch (a character
  // deleted and then another added), or a difference of 4 characters in length.
  return lettersChanges <= 4;
};

const getId = (value) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);

/**
 * Normalize an API-sourced id to a string for generateShowingId.
 * Expects only string or number; will convert number to string or return the
 * input otherwise for generateShowingId to deal with.
 * Use when the id comes from an external API that might return either type.
 */
function normalizeIdComponent(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return value;
}

function generateShowingId(attributes, rawEventId) {
  const attributesId = normalizeIdComponent(attributes?.id);
  const eventId = normalizeIdComponent(rawEventId);
  if (typeof attributesId !== "string" || attributesId === "") {
    throw new Error(
      "generateShowingId: attributes.id must be a non-empty string",
    );
  }
  if (typeof eventId !== "string" || eventId === "") {
    throw new Error("generateShowingId: eventId must be a non-empty string");
  }
  return `${attributesId.replace(/-$/, "")}-${eventId}`;
}

const isPrivateHire = (title = "") =>
  basicNormalize(title).includes("private hire") ||
  basicNormalize(title).includes("screen hire") ||
  basicNormalize(title).includes("private event") ||
  // Sometimes private screenings are advertised on an event site, but in which
  // case they'll contain more information (like the movie title)
  basicNormalize(title) === "private screening" ||
  basicNormalize(title) === "cleaning screen placeholder" ||
  basicNormalize(title).includes("do not book");

async function runLlmFunction(llmFunction, options = { run: 0 }) {
  try {
    return await llmFunction();
  } catch (e) {
    const { run } = options;

    // If it fails after a few retries, then don't keep trying
    if (run === 3) {
      console.log(` ! - Error asking LLM; failed after ${run + 1} attempts`);
      throw e;
    }

    // Fetch failed for an unknown reason; wait 30 seconds and try again.
    if (basicNormalize(e?.message).includes("fetch failed")) {
      console.log(" ! - Error asking LLM; pausing before trying again...");
      await sleep(30_000);
      return await runLlmFunction(llmFunction, { ...options, run: run + 1 });
    }

    // Rate limit was met; it should reset after 1 minute but it's had issues
    // before of not resetting correctly. Wait 90 seconds and try again.
    if (e.status === 429) {
      console.log(" ! - Error asking LLM; pausing for quota reset...");
      await sleep(90_000);
      return await runLlmFunction(llmFunction, { ...options, run: run + 1 });
    }

    // Model is overloaded; wait a few minutes and try again.
    if (e.status === 503) {
      console.log(" ! - Error asking LLM; pausing for model availability...");
      await sleep(180_000);
      return await runLlmFunction(llmFunction, { ...options, run: run + 1 });
    }

    // If we error on recitation, there's not much we can do. We don't want the
    // LLM making up information, and Google is blocking it reciting back some
    // of the training information. As such, just return empty.
    if (e?.response?.candidates?.[0]?.finishReason === "RECITATION") {
      return null;
    }

    // If we error on prohibited content, there's not much we can do. This may
    // be as a result of passing in results from the Movie DB with adult results
    // allowed. As such, just return empty.
    if (e?.response?.promptFeedback?.blockReason === "PROHIBITED_CONTENT") {
      return null;
    }

    // If it fails for an unknown reason, we need to throw and stop the script
    console.log("Error asking LLM", e);
    throw new Error("Error asking LLM");
  }
}

module.exports = {
  readJSON,
  writeJSON,
  basicNormalize,
  sanitizePathSegment,
  sortAndFilterMovies,
  getMovieTitleAndYearFrom,
  convertToList,
  splitConjoinedItemsInList,
  parseMinsToMs,
  sanitizeRichText,
  sleep,
  withRetry,
  fetchWithRetry,
  fetchText,
  fetchWin1252Text,
  fetchJson,
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
  removeMatchingHints,
  addTestCategory,
  compareAsSimilar,
  getId,
  generateShowingId,
  isPrivateHire,
  runLlmFunction,
  getValidClassification,
  convertNamesTextToList,
};
