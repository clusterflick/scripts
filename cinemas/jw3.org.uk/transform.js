const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  createOverview,
  basicNormalize,
  getText,
  createPerformance,
  createAccessibility,
  createFormat,
  generateShowingId,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

const getDetails = ($) => {
  const details = {};
  $(".infoList dl dt").each((i, el) => {
    const key = basicNormalize($(el).text());
    const value = getText($(el).next("dd"));
    if (key && value) details[key] = value;
  });
  return details;
};

const getOverview = ($) => {
  const details = getDetails($);
  const duration = (details.duration || "").replace(/\s*min$/i, "").trim();
  const classification = getText($(".descWrapper .subtitle"));
  return createOverview({
    duration,
    directors: details.direction,
    actors: details.cast,
    classification,
  });
};

const getSinglePerformance = ($, title, overview) => {
  const url = $(".buttonContainer a.btn-order").eq(0).attr("href");
  const startText = getText($(".top-date .start"));

  // Return empty if we can't find the date of any performances. This may happen
  // on festival pages where the date is a date range of multiple events.
  if (!startText) return null;

  const timeText = getText($(".top-date .time"))
    .toLowerCase()
    .replace(/\s+/g, "");
  const dateString = `${startText} ${new Date().getFullYear()} ${timeText}`;
  const details = getDetails($);
  const subtitled = basicNormalize(details.subtitles || "").includes("english");

  return [
    createPerformance({
      date: parseDate(dateString),
      notesList: [],
      url,
      accessibility: createAccessibility(title, { subtitled }, overview),
      format: createFormat(title, {}, overview),
    }),
  ];
};

const getMultiplePerformances = ($, bookingInformation, title, overview) => {
  const description = basicNormalize(bookingInformation.description);
  const details = getDetails($);
  const subtitled =
    description.includes("with english subtitles") ||
    basicNormalize(details.subtitles || "").includes("english");
  return bookingInformation.instances.map(({ id, start, availability }) => {
    return createPerformance({
      date: parseISO(start),
      notesList: [],
      url: `${attributes.domain}/spektrix/ChooseSeats?EventInstanceId=${id}`,
      status: {
        soldOut: availability.available === 0,
      },
      accessibility: createAccessibility(title, { subtitled }, overview),
      format: createFormat(title, {}, overview),
    });
  });
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const moviePageUrl in moviePages) {
    const { listing, booking } = moviePages[moviePageUrl];
    const pageDataLayer = listing.match(
      /<script>\s*var\s+dataLayer\s+=\s+(.*);\s+<\/script>/i,
    );
    const pageData = JSON.parse(pageDataLayer[1]);
    const itemProductionId = pageData[0].detail_items[0].item_production;
    // The ID used for getting events is the starting 6 digit numerical part
    const id = itemProductionId.match(/^(\d{6,7})/)[1];

    const $ = cheerio.load(listing);
    const title = getText($(".desc h1"));
    const overview = getText($("#content .container .richtext"));
    const performances = booking
      ? getMultiplePerformances($, booking, title, overview)
      : getSinglePerformance($, title, overview);

    if (performances) {
      movies.push({
        showingId: generateShowingId(attributes, id),
        title,
        url: `${attributes.domain}${moviePageUrl}`,
        overview: getOverview($),
        performances,
        matchingHints: { overview },
      });
    }
  }

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
