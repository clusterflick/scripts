const cheerio = require("cheerio");
const { parse, startOfDay } = require("date-fns");
const {
  createAccessibility,
  createOccasions,
  createFormat,
  createOverview,
  createPerformance,
  generateShowingId,
} = require("../utils");

const FILM_EVENT = /movie club|screening/i;

const getDescriptionLines = (description) =>
  cheerio
    .load(description.replace(/<br\s*\/?>|<\/div>/gi, "\n"), null, false)
    .root()
    .text()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

async function transform(attributes, { events }, sourcedEvents) {
  const { taproom, url } = attributes;
  const today = startOfDay(new Date());
  const taproomLine = new RegExp(`^${taproom}:\\s*(.+)$`);

  const movies = events
    .map((event) => ({
      event,
      date: parse(
        `${event.start.date} ${event.start.time}`,
        "yyyy-MM-dd HH:mm",
        new Date(),
      ),
    }))
    .filter(({ event, date }) => FILM_EVENT.test(event.name) && date >= today)
    .map(({ event, date }) => {
      const lines = getDescriptionLines(event.description);
      const title = lines
        .map((line) => line.match(taproomLine)?.[1])
        .find(Boolean);
      // A film night that doesn't name this taproom's film is a change of
      // format (January's feed listed a month's dates in one event), and the
      // screenings would otherwise vanish without anyone noticing.
      if (!title) {
        throw new Error(
          `"${event.name}" on ${event.start.date} names no film for ${taproom}`,
        );
      }
      const overview = lines
        .filter((line) => !/^[A-Z][A-Za-z ]+:\s/.test(line))
        .join("\n");
      return {
        showingId: generateShowingId(
          attributes,
          `${event.start.date}-${title}`,
        ),
        title: title.trim(),
        url,
        overview: createOverview({}),
        performances: [
          createPerformance({
            date,
            notesList: [event.name.split(" - ")[0]],
            url,
            accessibility: createAccessibility(title, {}, overview),
            format: createFormat(title, {}, overview),
            occasions: createOccasions(title, {}, overview, { date }),
          }),
        ],
        matchingHints: { overview },
      };
    });

  return movies.concat(Object.values(sourcedEvents).flat());
}

module.exports = transform;
