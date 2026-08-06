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
const {
  getWebEventId,
  getBookableInstances,
  isSoldOut,
} = require("../../common/spektrix");
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

const getPerformances = ($, bookingInformation, title, overview) => {
  const description = basicNormalize(bookingInformation.description);
  const details = getDetails($);
  const subtitled =
    description.includes("with english subtitles") ||
    basicNormalize(details.subtitles || "").includes("english");
  return getBookableInstances(bookingInformation).map((instance) => {
    return createPerformance({
      date: parseISO(instance.start),
      notesList: [],
      url: `${attributes.domain}/spektrix/ChooseSeats?EventInstanceId=${instance.id}`,
      status: {
        soldOut: isSoldOut(instance),
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
    const id = getWebEventId(itemProductionId);

    const $ = cheerio.load(listing);
    const title = getText($(".desc h1"));
    const overview = getText($("#content .container .richtext"));
    const performances = getPerformances($, booking, title, overview);

    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url: `${attributes.domain}${moviePageUrl}`,
      overview: getOverview($),
      performances,
      matchingHints: { overview },
    });
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
