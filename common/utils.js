var crypto = require("node:crypto");
const fs = require("node:fs").promises;
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
const isValidClassification = (value = "") => {
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
      .replaceAll("<br />", "\n")
      .replaceAll("<br>", "\n")
      .replaceAll("<p>", "\n")
      .replaceAll("</p>", "\n")
      .replaceAll("<strong>", "")
      .replaceAll("</strong>", "")
      .replaceAll("<em>", "")
      .replaceAll("</em>", "")
      .trim(),
  );

const fetchText = async (url) => (await fetch(url)).text();

const fetchJson = async (url) => (await fetch(url)).json();

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
  bookingUrl: encodeURI(url),
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

const createOverview = ({
  duration,
  year,
  categories = "",
  directors = "",
  actors = "",
  classification,
  trailer,
}) => {
  return {
    duration: parseMinsToMs(duration) || undefined,
    year: year || undefined,
    categories: Array.isArray(categories)
      ? categories
      : splitConjoinedItemsInList(convertToList(categories)),
    directors: Array.isArray(directors)
      ? directors
      : splitConjoinedItemsInList(convertToList(directors))
          .map(attemptEncodingFix)
          .map(removeNotes),
    actors: Array.isArray(actors)
      ? actors
      : splitConjoinedItemsInList(convertToList(actors))
          .map(attemptEncodingFix)
          .map(removeNotes),
    classification: isValidClassification(classification),
    trailer: trailer || undefined,
  };
};

const createAccessibility = (accessibility) =>
  Object.keys(accessibility).reduce((mapping, key) => {
    if (!accessibility[key]) return mapping;
    return { ...mapping, [key]: true };
  }, {});

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

function generateShowingId(attributes, eventId) {
  return `${attributes.id}-${eventId}`;
}

async function runLlmFunction(llmFunction) {
  try {
    return await llmFunction();
  } catch (e) {
    // Rate limit was met; wait for 60 seconds and try again
    if (
      e.status === 429 &&
      basicNormalize(e.statusText) === basicNormalize("Too Many Requests")
    ) {
      console.log("Error asking LLM; pausing for quota to reset...");
      await new Promise((resolve) => setTimeout(resolve, 65000));
      return await llmFunction();
    }

    // If we error on recitation
    if (e?.response?.candidates?.[0]?.finishReason === "RECITATION") {
      return null;
    }

    console.log("Error asking LLM", e);
    throw new Error("Error asking LLM");
  }
}

module.exports = {
  readJSON,
  writeJSON,
  basicNormalize,
  sortAndFilterMovies,
  getMovieTitleAndYearFrom,
  convertToList,
  splitConjoinedItemsInList,
  parseMinsToMs,
  sanitizeRichText,
  fetchText,
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
  runLlmFunction,
};
