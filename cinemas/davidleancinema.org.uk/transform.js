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

function getParagraphs(html) {
  const $ = cheerio.load(html);
  return $("p,div")
    .toArray()
    .map((el) => getText($(el)).replace(/\s+/g, " "))
    .join("\n")
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => !!value)
    .join("\n");
}

const stripLabel = (text, label) =>
  text.replace(new RegExp(`^${label}:\\s*`, "i"), "") || undefined;

function parseWebsiteEventPage(html, url) {
  const $ = cheerio.load(html);
  const metaParts = $(".event-meta p")
    .toArray()
    .map((el) => getText($(el)));
  return {
    url,
    year: metaParts.find((part) => /^\d{4}$/.test(part)),
    duration: metaParts
      .map((part) => part.match(/^(\d{2,3})\s*mins?$/i))
      .find(Boolean)?.[1],
    classification: $(".age-rating-icon").attr("alt"),
    directors: stripLabel(getText($(".director-block")), "Directed by"),
    actors: stripLabel(getText($(".stars-block")), "Stars"),
    trailer: $(".trailer-block iframe").attr("src"),
    overview: getParagraphs($(".entry-content").html() ?? ""),
  };
}

// Each website page links the Ticketsolve performances it covers, which is the
// join back to the feed. A show can have several pages (its "& Q&A" screening,
// say) carrying the same film details. WordPress suffixes the slug of each
// later page ("the-incomer-2"), so the shortest URL is the show's original
// page. A past event with no booking links joins to nothing.
const byShortestUrl = (a, b) => a.length - b.length || a.localeCompare(b);

function getWebsiteDetailsByShowId(eventPages) {
  const detailsByShowId = {};
  for (const url of Object.keys(eventPages).sort(byShortestUrl)) {
    const $ = cheerio.load(eventPages[url]);
    const showIds = $(".ticket-buttons a")
      .toArray()
      .map(
        (el) =>
          $(el)
            .attr("href")
            ?.match(/\/shows\/(\d+)\/events\//)?.[1],
      )
      .filter(Boolean);
    for (const showId of new Set(showIds)) {
      detailsByShowId[showId] ??= parseWebsiteEventPage(eventPages[url], url);
    }
  }
  return detailsByShowId;
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

// The blurb is shared by every performance of a show, but the venue uses it to
// signpost a single captioned one ("Our Tuesday 7:30pm screening contains
// captioned subtitles for those with hearing loss"), so reading hard-of-hearing
// from it tags every performance. That screening carries its own "HoH" event
// attribute, so take hard-of-hearing from the attribute and title only.
function getPerformanceAccessibility(title, accessibility, overview) {
  const result = createAccessibility(title, accessibility, overview);
  const isHardOfHearing =
    accessibility.hardOfHearing ||
    getTitleAccessibility(title.trim()).hardOfHearing;
  if (!isHardOfHearing) delete result.hardOfHearing;
  return result;
}

// A "sold out" in the shows feed is also how a performance that hasn't gone on
// sale yet reads, so it only counts once the event's own feed - fetched for
// every such performance - has no seats left.
function isSoldOut($event, eventFeeds) {
  if (basicNormalize(getTextAt($event, "status")) !== "sold out") return false;
  if (!eventFeeds) {
    throw new Error(
      "No event feeds in the retrieved data - it may predate the retrieve that fetches them",
    );
  }
  const eventId = $event.attr("id");
  const eventFeed = eventFeeds[eventId];
  if (!eventFeed) {
    throw new Error(`No event feed retrieved for sold out event ${eventId}`);
  }
  const available = getText(
    cheerio.load(eventFeed, { xmlMode: true })("event > available"),
  );
  if (!/^\d+$/.test(available)) {
    throw new Error(
      `Unexpected available seat count "${available}" for event ${eventId}`,
    );
  }
  return Number(available) === 0;
}

function toMovie($, showEl, websiteDetails, eventFeeds) {
  const $show = $(showEl);
  const id = $show.attr("id");
  const showingId = generateShowingId(attributes, id);
  const title = getTextAt($show, "name");

  const categories = getTags($, $show);
  const description = getTextAt($show, "description");
  const fromTicketsolve = {
    ...parseOverviewFromDescription(description),
    trailer: getTrailer($, $show),
    overview: getParagraphs(description),
  };
  const fromWebsite = websiteDetails[id] ?? {};
  const pick = (key) => fromWebsite[key] || fromTicketsolve[key];

  // A show the venue hasn't written a page for yet (or ever) links to its
  // Ticketsolve page instead. The feed's own show `<url>` is no use here: it's
  // a venue-wide setting, the same "#whatson" link on the old domain for every
  // show, which lands on the homepage.
  const url =
    fromWebsite.url ||
    `https://davidleancinema.ticketsolve.com/ticketbooth/shows/${id}`;
  const overview = pick("overview");

  const eventNodes = $show.find("events > event");

  const performances = eventNodes.toArray().map((el) => {
    const $event = $(el);
    const rawDate = getTextAt($event, "date_time_iso");
    const bookingUrl = getTextAt($event, "url") || url;
    const soldOut = isSoldOut($event, eventFeeds);
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
      accessibility: getPerformanceAccessibility(
        title,
        accessibility,
        overview,
      ),
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
      duration: pick("duration"),
      year: pick("year"),
      directors: pick("directors"),
      actors: pick("actors"),
      classification: fromWebsite.classification,
      categories,
      trailer: pick("trailer"),
    }),
    performances,
    matchingHints: { overview },
  };
}

async function transform(
  { movieListPage, eventFeeds, eventPages },
  sourcedEvents,
) {
  const $ = cheerio.load(movieListPage, { xmlMode: true });
  const shows = $("venues > venue > shows > show").toArray();

  const websiteDetails = getWebsiteDetailsByShowId(eventPages);
  const showIds = shows.map((el) => $(el).attr("id"));
  if (!showIds.some((showId) => websiteDetails[showId])) {
    throw new Error(
      "No website event page links to a Ticketsolve show - the page structure may have changed",
    );
  }

  const movies = shows
    .map((el) => toMovie($, el, websiteDetails, eventFeeds))
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
