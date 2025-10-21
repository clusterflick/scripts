const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  createOverview,
  basicNormalize,
  getText,
  createPerformance,
  createAccessibility,
  generateShowingId,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

const getSection = ($, heading) =>
  $("p.js-accordion__header")
    .filter(function () {
      return basicNormalize($(this).text()) === basicNormalize(heading);
    })
    .eq(0)
    .next();

const getDetails = ($) => {
  const $credits = getSection($, "credits");
  const pieces = $credits.text().trim().split("\n");
  return pieces.reduce((details, line) => {
    if (!line) return details;
    const [keyRaw, ...value] = line.split(/:\s*/);
    const key = basicNormalize(keyRaw).replace(/s$/, "");
    return { ...details, [key]: value.join(":").trim() };
  }, {});
};

const getOverview = ($) => {
  const [durationText, classification] = getText(
    $(".m-banner__copy h1").next(".o-event__details"),
  ).split("|");
  const duration = durationText
    ? durationText.replace("minutes", "").trim()
    : undefined;
  const trailer = $(".video-embed-field-provider-youtube iframe").attr("src");
  const details = getDetails($);

  return createOverview({
    duration,
    directors: details.director,
    actors: details.star,
    categories: details.genre,
    trailer,
    classification,
  });
};

const getNotesList = ($, $sidebars) => {
  const $tagsSidebar = $sidebars
    .filter(
      (i, el) =>
        basicNormalize($(el).text()).startsWith("part of:") ||
        basicNormalize($(el).text()).startsWith("type:"),
    )
    .eq(0);
  return $tagsSidebar
    .find(".views-field-title,a.a-tag")
    .map((i, el) => getText($(el)))
    .get()
    .filter((tag) => basicNormalize(tag) !== "cinema");
};

const getSinglePerformance = ($) => {
  const url = $(".m-banner__links a.a-btn").eq(0).attr("href");
  const $sidebars = $(".o-sidebar--event.m-entity");
  const $dateSidebar = $sidebars
    .filter((i, el) => basicNormalize($(el).text()).includes("date -"))
    .eq(0);
  const date = getText(
    $dateSidebar
      .find("strong")
      .filter((i, el) => basicNormalize($(el).text()).startsWith("date -"))
      .eq(0),
  ).replace(/^date\s+-\s+/i, "");

  // Return empty if we can't find the date of any performances. This may happen
  // on festival pages where the date is a date range of multiple events.
  if (!date) return null;

  const $infoSidebar = $sidebars
    .filter((i, el) => basicNormalize($(el).text()).startsWith("please note"))
    .eq(0);
  const title = basicNormalize(getText($(".m-banner__copy h1")));
  const description = basicNormalize(getText($infoSidebar));

  return [
    createPerformance({
      date: parseDate(date),
      notesList: getNotesList($, $sidebars),
      url,
      accessibility: {
        subtitled: description.includes("with english subtitles"),
        babyFriendly: title.startsWith("babykino:"),
      },
    }),
  ];
};

const getMultiplePerformances = ($, bookingInformation) => {
  const $sidebars = $(".o-sidebar--event.m-entity");
  const title = basicNormalize(getText($(".m-banner__copy h1")));
  const description = basicNormalize(bookingInformation.description);
  return bookingInformation.instances.map(({ id, start, availability }) => {
    return createPerformance({
      date: parseISO(start),
      notesList: getNotesList($, $sidebars),
      url: `https://purchase.jw3.org.uk/ChooseSeats/${id}`,
      status: {
        soldOut: availability.available === 0,
      },
      accessibility: createAccessibility({
        subtitled: description.includes("with english subtitles"),
        babyFriendly: title.startsWith("babykino:"),
      }),
    });
  });
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const moviePageUrl in moviePages) {
    const { listing, booking } = moviePages[moviePageUrl];
    const $ = cheerio.load(listing);
    const shortLinkUrl = $("link[rel='shortlink']").attr("href");
    const id = shortLinkUrl.match(/\/node\/([^/]+)$/i)[1];
    const performances = booking
      ? getMultiplePerformances($, booking)
      : getSinglePerformance($);

    if (performances) {
      movies.push({
        showingId: generateShowingId(attributes, id),
        title: getText($(".m-banner__copy h1")),
        url: `${attributes.domain}${moviePageUrl}`,
        overview: getOverview($),
        performances,
        matchingHints: {
          overview:
            getText(getSection($, "synopsis")) || getText($(".m-entity__body")),
        },
      });
    }
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
