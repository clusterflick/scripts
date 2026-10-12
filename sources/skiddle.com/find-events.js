const path = require("node:path");
const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
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
const attributes = require("./attributes");

function getDescription(html) {
  const $ = cheerio.load(html || "");
  $("br").replaceWith("\n");
  $("p, h1, h2, h3, h4, h5, h6, li").after("\n");
  return getText($.root());
}

function convertSkiddleEvent(event) {
  const { id, eventName: title, link: url } = event;
  const description = getDescription(event.fullDescription);

  // Written in London time with no offset, which `parseISO` reads as local -
  // and the pipeline always runs with TZ=Europe/London.
  const date = parseISO(event.startDate);

  return {
    showingId: generateShowingId(attributes, id),
    title,
    url,
    overview: createOverview({}),
    performances: [
      createPerformance({
        date,
        url,
        accessibility: createAccessibility(title, {}, description),
        format: createFormat(title, {}, description),
      }),
    ],
    matchingHints: { overview: description },
  };
}

/**
 * Find events matching a specific cinema
 */
async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "skiddle.com");

  let events = [];
  try {
    const data = await readJSON(dataSrc);
    events = data.events || [];
  } catch {
    // Source data may not always be available or required
  }

  return events
    .filter(({ cancelled }) => !cancelled)
    .filter(({ venue }) =>
      venueMatchesCinema(
        cinema,
        venue.name,
        { lat: venue.latitude, lon: venue.longitude },
        { eventAddress: `${venue.address}, ${venue.postcode}` },
      ),
    )
    .map(convertSkiddleEvent);
}

module.exports = findEvents;
