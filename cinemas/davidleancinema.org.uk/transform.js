const { format, isValid, parse, parseISO } = require("date-fns");
const cheerio = require("cheerio");
const {
  basicNormalize,
  createOverview,
  createPerformance,
  generateShowingId,
  createAccessibility,
  createOccasions,
  createFormat,
  getTitleAccessibility,
  getTitleFormat,
  getTitleOccasions,
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

// A page's date line, e.g. "Tuesday 15 December at 2:30pm & 7:30pm*", as the
// "MM-dd HH:mm" of each time it names. The year is left out because the page
// leaves it out; a feed spans months, not a year, so the day and time are
// enough to find the performance.
function getPageTimes($, url) {
  const dateLines = $(".event-date")
    .toArray()
    .map((el) =>
      $(el)
        .find("p")
        .toArray()
        .map((p) => getText($(p)))
        .join(" "),
    );
  if (dateLines.length !== 1) {
    throw new Error(
      `Expected one date line on ${url}, found ${dateLines.length}`,
    );
  }
  const [dateLine] = dateLines;
  const match = dateLine.match(/^\w+day\s+(\d{1,2})\s+(\w+)\s+at\s+(.+)$/i);
  if (!match) {
    throw new Error(`Unable to read the date line "${dateLine}" on ${url}`);
  }
  const [, day, month, timesText] = match;
  // 2000 is a leap year, so a page for 29 February still reads
  const monthDay = parse(`${day} ${month}`, "d MMMM", new Date(2000, 0, 1));
  if (!isValid(monthDay)) {
    throw new Error(`Unable to read the date "${day} ${month}" on ${url}`);
  }
  // Written by hand, so "2:30pm", "2.30pm", "2:00 pm" and "2pm" all occur, joined
  // by "&" or "and", with a note on one ("2.30pm (HOH)"), and "2.30 & 7.30pm"
  // leaves the first time's am/pm to the last.
  const times = timesText
    .replace(/\([^)]*\)|\*/g, "")
    .split(/&|\band\b/i)
    .map((timeText) => {
      const time = timeText
        .trim()
        .match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i);
      if (!time) {
        throw new Error(`Unable to read the time "${timeText}" on ${url}`);
      }
      const [, hour, minute = "00", meridiem] = time;
      return { hour: Number(hour), minute, meridiem: meridiem?.toLowerCase() };
    });
  for (let i = times.length - 2; i >= 0; i -= 1) {
    times[i].meridiem ??= times[i + 1].meridiem;
  }
  return times.map(({ hour, minute, meridiem }) => {
    if (!meridiem) {
      throw new Error(`No am or pm in the date line "${dateLine}" on ${url}`);
    }
    const hour24 = (hour % 12) + (meridiem === "pm" ? 12 : 0);
    return `${format(monthDay, "MM-dd")} ${String(hour24).padStart(2, "0")}:${minute}`;
  });
}

// Words of a title for comparing the page's with the feed's, which differ in
// case, in what follows the film's name ("& Q&A", "- Dementia Friendly") and
// occasionally in spelling (the feed's "NT LIVE: GOLDERN BOY").
// Filler words are left out, so "The Front Page" and "The Incomer" don't agree
// on "the"; a title is never all filler ("1 in 2" keeps "1" and "2").
const FILLER_WORDS = new Set(["a", "an", "and", "at", "in", "of", "q", "the"]);
const titleWords = (title) =>
  new Set(
    basicNormalize(title)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word && !FILLER_WORDS.has(word)),
  );

const titlesAgree = (a, b) => {
  const wordsOfB = titleWords(b);
  return [...titleWords(a)].some((word) => wordsOfB.has(word));
};

// The shows a page is about, by the performances on the day and time it names.
// The venue has a single screen, so a day and time is one performance. The
// title is a cross-check: a time landing on a show sharing no word with the
// page's title means one of the two is wrong, and the details would go on the
// wrong film. The times are typed by hand and sometimes wrong - Bad Apples'
// babes-in-arms page said "1:00 am" for an 11am screening - so a time that
// lands on nothing falls back to the one show on that day the title agrees
// with.
function getShowIdsByDate($, url, { showIdsByTime, showIdsByDay, showNames }) {
  const pageTitle = getText($("h1.wp-block-post-title").first());
  return getPageTimes($, url).flatMap((time) => {
    const showId = showIdsByTime[time];
    if (showId) {
      if (!titlesAgree(pageTitle, showNames[showId])) {
        throw new Error(
          `The page "${pageTitle}" (${url}) falls on a performance of "${showNames[showId]}" - one of them has the wrong date or title`,
        );
      }
      return [showId];
    }
    const sameDay = [...(showIdsByDay[time.slice(0, 5)] ?? [])].filter((id) =>
      titlesAgree(pageTitle, showNames[id]),
    );
    if (sameDay.length > 1) {
      throw new Error(
        `The page "${pageTitle}" (${url}) gives a time with no performance, and its day has several shows it could be`,
      );
    }
    return sameDay;
  });
}

// Each website page has to be joined back to the Ticketsolve show it covers.
// The page's booking links named it until 21 November 2026, when they vanished
// from every page at once - so a page with them is joined by them, and one
// without by the day and time it gives. A show can have several pages (its "&
// Q&A" screening, say) carrying the same film details. WordPress suffixes the
// slug of each later page ("the-incomer-2"), so the shortest URL is the show's
// original page. A past event joins to nothing.
const byShortestUrl = (a, b) => a.length - b.length || a.localeCompare(b);

function getWebsiteDetailsByShowId(eventPages, $feed) {
  const showIdsByTime = {};
  const showIdsByDay = {};
  const showNames = {};
  $feed("venues > venue > shows > show").each((index, showEl) => {
    const $show = $feed(showEl);
    const showId = $show.attr("id");
    showNames[showId] = getTextAt($show, "name");
    $show.find("events > event").each((index, eventEl) => {
      const rawDate = getTextAt($feed(eventEl), "date_time_iso");
      const time = format(parseISO(rawDate), "MM-dd HH:mm");
      // Two shows at one time (one relisted under a new id, say) leave the
      // time naming neither, for the same day's titles to decide between
      showIdsByTime[time] =
        time in showIdsByTime && showIdsByTime[time] !== showId ? null : showId;
      (showIdsByDay[time.slice(0, 5)] ??= new Set()).add(showId);
    });
  });

  const detailsByShowId = {};
  for (const url of Object.keys(eventPages).sort(byShortestUrl)) {
    const $ = cheerio.load(eventPages[url]);
    const linkedShowIds = $(".ticket-buttons a")
      .toArray()
      .map(
        (el) =>
          $(el)
            .attr("href")
            ?.match(/\/shows\/(\d+)\/events\//)?.[1],
      )
      .filter(Boolean);
    const showIds =
      linkedShowIds.length > 0
        ? linkedShowIds
        : getShowIdsByDate($, url, { showIdsByTime, showIdsByDay, showNames });
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
      // The attribute carries a Q&A too ("+Q&A", "& Q&A") - none in the
      // current recordings, 97 performances across a year of releases.
      occasions: createOccasions(
        title,
        getTitleOccasions(eventAttribute),
        overview,
        { date },
      ),
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

  const websiteDetails = getWebsiteDetailsByShowId(eventPages, $);
  const showIds = shows.map((el) => $(el).attr("id"));
  if (!showIds.some((showId) => websiteDetails[showId])) {
    throw new Error(
      "No website event page matches a Ticketsolve show - the page structure may have changed",
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
