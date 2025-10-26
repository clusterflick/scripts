const { parseISO } = require("date-fns");
const cheerio = require("cheerio");
const {
  basicNormalize,
  createOverview,
  createPerformance,
  generateShowingId,
  createAccessibility,
  getText,
} = require("../../common/utils");
const attributes = require("./attributes");

const getTextAt = ($context, selector) =>
  getText($context.find(selector).first());

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function getTags($, $show) {
  const tags = $show
    .find("tags > tag")
    .toArray()
    .map((el) => getText($(el)))
    .filter((value) => !!value)
    .filter((value) => basicNormalize(value).toLowerCase() !== "template:event")
    .map((value) => capitalizeFirstLetter(value));
  return [...new Set(tags)];
}

function getTrailer($, $show) {
  let trailerUrl;
  $show.find("properties > property").each(function () {
    const propertyName = basicNormalize(getTextAt($(this), "name"));
    if (propertyName === "trailer") {
      trailerUrl = getTextAt($(this), "value") || undefined;
    }
  });
  return trailerUrl;
}

function parseOverviewFromDescription(descriptionHtml) {
  if (!descriptionHtml) return {};

  const $ = cheerio.load(descriptionHtml);

  let year;
  let duration;
  let directors;
  let actors;

  const yearRegex = /\b(\d{4})\b/;
  const durationRegex = /(\d{2,3})\s*mins?\b/i;

  $("p").each(function () {
    const text = getText($(this));
    if (!text) return;

    if (!directors) {
      const match = text.match(/^Director(?:s)?:\s*(.+)$/i);
      if (match) directors = match[1];
    }

    if (!actors) {
      const match = text.match(/^(?:Stars?|Cast):\s*(.+)$/i);
      if (match) actors = match[1];
    }

    const yearMatch = text.match(yearRegex);
    const durationMatch = text.match(durationRegex);
    if (yearMatch && durationMatch) {
      year = yearMatch[1];
      duration = durationMatch[1];
    }
  });

  return {
    year,
    duration,
    directors,
    actors,
  };
}

function mapAccessibilityFromAttribute(attr = "") {
  const value = basicNormalize(attr);
  return {
    hardOfHearing: value.includes("hoh"),
    subtitled: value.includes("subtitl"),
    babyFriendly: value.includes("babes-in-arms") || value.includes("bias"),
    relaxed: value.includes("relaxed"),
    audioDescription: value.includes("audio desc"),
  };
}

function toMovie($, showEl) {
  const $show = $(showEl);
  const id = $show.attr("id");
  const showingId = generateShowingId(attributes, id);
  const title = getTextAt($show, "name");
  const url = getTextAt($show, "url") || attributes.url;

  const categories = getTags($, $show);
  const trailer = getTrailer($, $show);
  const { year, duration, directors, actors } = parseOverviewFromDescription(
    getTextAt($show, "description"),
  );

  const eventNodes = $show.find("events > event");

  const performances = eventNodes.toArray().map((el) => {
    const $event = $(el);
    const rawDate = getTextAt($event, "date_time_iso");
    const bookingUrl = getTextAt($event, "url") || url;
    const soldOut = basicNormalize(getTextAt($event, "status")) === "sold out";
    const eventAttribute = getTextAt($event, "event_attribute");
    const accessibility = mapAccessibilityFromAttribute(eventAttribute);
    const comment = getTextAt($event, "comment");
    const date = parseISO(rawDate);
    return createPerformance({
      date,
      notesList: [comment],
      url: bookingUrl,
      status: { soldOut },
      accessibility: createAccessibility(accessibility),
    });
  });

  return {
    showingId,
    title,
    url,
    overview: createOverview({
      duration,
      year,
      directors,
      actors,
      categories,
      trailer,
    }),
    performances,
    matchingHints: {
      overview: cheerio
        .load(getTextAt($show, "description"))
        .root()
        .find("p")
        .toArray()
        .map((el) => getText($(el)).replace(/\s+/g, " "))
        .join("\n")
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => !!value)
        .join("\n"),
    },
  };
}

async function transform({ movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage, { xmlMode: true });
  const shows = $("venues > venue > shows > show").toArray();
  const movies = shows.map((el) => toMovie($, el));

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
