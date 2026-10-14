const path = require("node:path");
const { parseISO } = require("date-fns");
const {
  readJSON,
  generateShowingId,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const validateFestivals = require("./validate-festivals");
const attributes = require("./attributes");

function describeFilm({ title, directors = [], year }) {
  const credits = [directors.join(" & "), year].filter(Boolean).join(", ");
  return credits ? `${title} (${credits})` : title;
}

// The film list goes into the overview because that is where the shorts and
// multiple-movies stages look for the films on a bill - one per line, with the
// director and year that let each be told apart from a namesake.
function getOverview({ description, films = [] }) {
  const filmList = films.length
    ? `Films:\n${films.map((film) => `- ${describeFilm(film)}`).join("\n")}`
    : "";
  return [description, filmList].filter(Boolean).join("\n\n");
}

function convertEvent(event) {
  const { id, title, url, notes } = event;
  const overview = getOverview(event);

  // London time with no offset, which `parseISO` reads as local - and the
  // pipeline always runs with TZ=Europe/London.
  const date = parseISO(event.start);

  return {
    showingId: generateShowingId(attributes, id),
    title,
    url,
    overview: createOverview({}),
    performances: [
      createPerformance({
        date,
        url,
        notesList: [notes],
        accessibility: createAccessibility(title, {}, overview),
        format: createFormat(title, {}, overview),
      }),
    ],
    matchingHints: { overview },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", attributes.id);

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const festivals = data.festivals ?? [];
  validateFestivals(festivals);

  return festivals
    .flatMap(({ events }) => events)
    .filter(({ venue }) => venue === cinema.id)
    .map(convertEvent);
}

module.exports = findEvents;
