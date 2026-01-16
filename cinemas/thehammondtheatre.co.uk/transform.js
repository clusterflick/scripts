const cheerio = require("cheerio");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  createOverview,
  createPerformance,
  generateShowingId,
  getText,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");

const allowedTypes = ["cinema", "screening", "nt live"];

function getFieldValue($details, $, label) {
  // Find a <p> containing the label text, then get the next <p> sibling for the value
  const $label = $details
    .find("p")
    .filter((i, el) => basicNormalize(getText($(el))) === basicNormalize(label))
    .eq(0);
  return getText($label.next("p"));
}

function parseDateTime(dateStr, timeStr) {
  // Date format: "22/01/2026", Time format: "7:00 pm"
  const dateTimeStr = `${dateStr} ${timeStr}`;
  return parse(dateTimeStr, "dd/MM/yyyy h:mm a", new Date(), { locale: enGB });
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [url, html] of Object.entries(moviePages)) {
    const $ = cheerio.load(html);
    const $bookNowButton = $("a")
      .filter((i, el) => basicNormalize(getText($(el))) === "book now")
      .eq(0);
    const $details = $bookNowButton.closest("div").parent();

    const type = getFieldValue($details, $, "Type");
    if (!allowedTypes.includes(basicNormalize(type))) {
      continue;
    }

    const dateStr = getFieldValue($details, $, "Date");
    const startingTime = getFieldValue($details, $, "Starting Time");
    const doorsOpen = getFieldValue($details, $, "Doors Open");
    const description = getText($("div.prose").eq(0));

    // Generate a unique ID from the URL slug
    const id = url.split("/whats-on/")[1];
    if (!id) {
      throw new Error(`No ID found for ${url}`);
    }

    movies.push({
      showingId: generateShowingId(attributes, id),
      title: getText($("h1").eq(0)),
      url,
      overview: createOverview({}),
      performances: [
        createPerformance({
          date: parseDateTime(dateStr, startingTime),
          notesList: doorsOpen ? [`Doors open: ${doorsOpen}`] : [],
          url: $bookNowButton.attr("href"),
        }),
      ],
      matchingHints: {
        overview: description,
      },
    });
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
