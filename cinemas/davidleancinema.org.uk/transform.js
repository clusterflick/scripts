const { parseISO } = require("date-fns");
const cheerio = require("cheerio");
const {
  basicNormalize,
  createOverview,
  createPerformance,
  generateShowingId,
  createAccessibility,
  createFormat,
  getTitleAccessibility,
  getTitleFormat,
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

  $("p,div").each(function () {
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

// The per-event `event_attribute` is a label in the venue's own vocabulary
// ("HoH Subtitled", "BiAs", "Dementia Friendly", "35mm"). Run it through the
// shared label matchers as well as the venue-specific checks below, because
// neither covers it alone: the shared list knows "Dementia Friendly" (and
// "SEND-Friendly") means relaxed, while only the local checks catch this
// venue's bare "Relaxed" and its "BiAs" shorthand for babes-in-arms.
function mapAccessibilityFromAttribute(attr = "", overview = "") {
  const value = basicNormalize(attr);
  const shared = getTitleAccessibility(attr.trim());
  return {
    hardOfHearing: shared.hardOfHearing || value.includes("hoh"),
    subtitled:
      shared.subtitled ||
      value.includes("subtitl") ||
      basicNormalize(overview).includes("with english subtitles"),
    babyFriendly:
      shared.babyFriendly ||
      value.includes("babes-in-arms") ||
      value.includes("bias"),
    relaxed: shared.relaxed || value.includes("relaxed"),
    audioDescription: shared.audioDescription || value.includes("audio desc"),
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

  const overview = cheerio
    .load(getTextAt($show, "description"))
    .root()
    .find("p,div")
    .toArray()
    .map((el) => getText($(el)).replace(/\s+/g, " "))
    .join("\n")
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => !!value)
    .join("\n");

  const performances = eventNodes.toArray().map((el) => {
    const $event = $(el);
    const rawDate = getTextAt($event, "date_time_iso");
    const bookingUrl = getTextAt($event, "url") || url;
    const soldOut = basicNormalize(getTextAt($event, "status")) === "sold out";
    const eventAttribute = getTextAt($event, "event_attribute");
    const accessibility = mapAccessibilityFromAttribute(
      eventAttribute,
      overview,
    );
    const comment = getTextAt($event, "comment");
    const date = parseISO(rawDate);
    return createPerformance({
      date,
      notesList: [comment],
      url: bookingUrl,
      status: { soldOut },
      accessibility: createAccessibility(title, accessibility, overview),
      // The same attribute also carries the print format, spelled either
      // "35mm" or "35mm film" - so read it with the label matchers rather than
      // as an exact token, which only the first spelling would satisfy.
      format: createFormat(title, getTitleFormat(eventAttribute), overview),
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
    matchingHints: { overview },
  };
}

async function transform({ movieListPage }, sourcedEvents) {
  const $ = cheerio.load(movieListPage, { xmlMode: true });
  const shows = $("venues > venue > shows > show").toArray();
  const movies = shows
    .map((el) => toMovie($, el))
    // Remove template placeholder entries (e.g. "Templates:", "Template - ")
    .filter(({ title }) => !/^Templates?\s*[:-]/i.test(title));

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
