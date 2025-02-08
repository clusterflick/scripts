const { decode } = require("html-entities");
const { format, isAfter, startOfDay } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const replaceSpecialCharacters = require("replace-special-characters");

const generateEventDescription = (show, performance) => {
  let description = "";
  if (performance.screen)
    description += `Showing in screen ${performance.screen}\n`;
  if (show.overview.classification)
    description += `Film classification: ${show.overview.classification}\n`;
  if (show.overview.actors && show.overview.actors.length > 0)
    description += `Starring ${show.overview.actors.join(", ")}\n`;
  if (show.overview.directors && show.overview.directors.length > 0)
    description += `Directed by ${show.overview.directors.join(", ")}\n`;
  if (show.url) description += `For more details, see ${show.url}\n`;
  if (performance.bookingUrl)
    description += `Book tickets at ${performance.bookingUrl}\n`;
  if (performance.notes) description += `\nNotes:\n${performance.notes}\n`;
  if (show.moviedb) {
    description += `\n---\n\n`;
    description += `[Match found in The Movie Database]\n`;
    description += `${show.moviedb.title} (${show.moviedb.releaseDate.split("-")[0]}) - https://www.themoviedb.org/movie/${show.moviedb.id}\n`;
    description += `${show.moviedb.summary || "No summary available"}\n`;
  }
  return description.trim();
};

const getEventDate = (time) =>
  format(time, "yyyy-M-d-H-m", { locale: enGB })
    .split("-")
    .map((value) => parseInt(value, 10));

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

const convertToList = (value) => {
  if (!value) return [];
  const list = value
    .split(/,|\n|\||\/|&|;/g)
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

const sanitize = (value) =>
  replaceSpecialCharacters(value.replace(/\s+/g, " "));

const sanitizeRichText = (value) =>
  decode(value.replaceAll("<br />", "\n").trim());

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
  bookingUrl: url,
  screen: getScreen(screen),
  status,
  accessibility,
});

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
      : splitConjoinedItemsInList(convertToList(directors)),
    actors: Array.isArray(actors)
      ? actors
      : splitConjoinedItemsInList(convertToList(actors)),
    classification: isValidClassification(classification),
    trailer: trailer || undefined,
  };
};

const createAccessibility = (accessibility) =>
  Object.keys(accessibility).reduce((mapping, key) => {
    if (!accessibility[key]) return mapping;
    return { ...mapping, [key]: true };
  }, {});

module.exports = {
  generateEventDescription,
  getEventDate,
  sortAndFilterMovies,
  convertToList,
  splitConjoinedItemsInList,
  parseMinsToMs,
  sanitize,
  sanitizeRichText,
  fetchText,
  fetchJson,
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
};
