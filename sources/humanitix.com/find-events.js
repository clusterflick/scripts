const path = require("node:path");
const cheerio = require("cheerio");
const {
  readJSON,
  generateShowingId,
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const { getEventUrl } = require("./utils");
const attributes = require("./attributes");

/**
 * Read the event's description off its page.
 *
 * The page carries a second block of the same rich text below it - the
 * organiser's bio - so the description is picked out by the heading of the
 * module it sits in rather than by the rich text's own markup.
 */
function getDescription(event, html) {
  const $ = cheerio.load(html);
  const $module = $(".EventModuleRichText").filter(
    (i, el) => getText($(el).find("h2")) === "Description",
  );
  if ($module.length !== 1) {
    throw new Error(
      `humanitix event ${event._id} has ${$module.length} "Description" modules on its page, expected 1`,
    );
  }

  // Paragraphs are separate elements with nothing between them, so they would
  // otherwise run together into one line of text.
  const $content = $module.find(".RichContent");
  $content.find("br").replaceWith("\n");
  $content.find("p, li").after("\n");
  return getText($content);
}

function convertHumanitixEvent(event, eventPages) {
  if (!event._id) {
    throw new Error("humanitix event is missing _id");
  }
  if (!event.name) {
    throw new Error(`humanitix event ${event._id} is missing name`);
  }
  if (!Array.isArray(event.dates) || event.dates.length === 0) {
    throw new Error(`humanitix event ${event._id} is missing dates`);
  }

  const url = getEventUrl(event);
  if (!eventPages[url]) {
    throw new Error(`humanitix event ${event._id} has no retrieved page`);
  }
  const description = getDescription(event, eventPages[url]);

  const performances = event.dates.map(({ startDate }) => {
    const date = new Date(startDate);
    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `humanitix event ${event._id} has an unparseable startDate: ${startDate}`,
      );
    }
    return createPerformance({
      date,
      url,
      accessibility: createAccessibility(event.name, {}),
      format: createFormat(event.name, {}, ""),
    });
  });

  return {
    showingId: generateShowingId(attributes, event._id),
    title: event.name,
    url,
    overview: createOverview({}),
    performances,
    matchingHints: { overview: description },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "humanitix.com");

  let events = [];
  let eventPages = {};
  try {
    const data = await readJSON(dataSrc);
    events = data.events || [];
    eventPages = data.eventPages || {};
  } catch {
    // Source data may not always be available or required
    return [];
  }

  const filteredEvents = events.filter((event) => {
    const location = event.eventLocation;
    // Events without a physical venue (e.g. online) cannot match a cinema
    if (!location || !location.venueName) return false;

    // Humanitix events carry no coordinates, only an address string, so
    // matching falls back to venue name plus postcode extracted from the address
    return venueMatchesCinema(cinema, location.venueName, null, {
      eventAddress: location.address,
    });
  });

  return filteredEvents.map((event) =>
    convertHumanitixEvent(event, eventPages),
  );
}

module.exports = findEvents;
