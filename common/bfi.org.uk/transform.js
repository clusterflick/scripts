const cheerio = require("cheerio");
const {
  createOverview,
  getText,
  createPerformance,
  createAccessibility,
  createFormat,
  convertToList,
  splitConjoinedItemsInList,
  generateShowingId,
  getDescriptionAccessibility,
} = require("../utils");
const { parseDate, extractSearchResults } = require("./utils");

// A `searchResults` row is a positional array; these are the fields we read.
// row[7] and row[64] are byte-identical to the calendar's `.start-date` and
// `.item-venue`, so a recovered performance keys into `accessibilityMapping`
// exactly as a calendar-derived one does.
const SEARCH_RESULT_CONTEXT_ID = 0;
const SEARCH_RESULT_START_DATE = 7;
const SEARCH_RESULT_SCREEN = 64;

function getContextId(href = "") {
  return href.split("context_id=")[1] || "";
}

function getOverviewFor($) {
  const overview = {
    categories: "",
    directors: "",
    actors: "",
  };

  const $showInfo = $("ul.Film-info__information li");
  $showInfo.each(function () {
    const heading = getText(
      $(this).find(".Film-info__information__heading"),
    ).toLowerCase();
    const content = getText($(this).find(".Film-info__information__value"));

    if (heading === "director" && !overview.directors) {
      overview.directors = content;
    } else if (heading === "with" && !overview.actors) {
      overview.actors = content;
    } else if (heading === "certificate" && !overview.classification) {
      overview.classification = content;
    } else {
      const hasTimings = content.match(/\s+(\d{4}).\s+(\d+)min(?:\s|$)/i);
      if (hasTimings && !overview.year) {
        overview.year = hasTimings[1];
      }
      if (hasTimings && !overview.duration) {
        overview.duration = hasTimings[2];
      }
    }
  });

  return createOverview(overview);
}

function getPerformancesFor($, url, show, overview, venueFormat) {
  const { title, performances, html } = show;
  const $showInfo = $("ul.Film-info__information li");
  let isSubtitled = false;
  $showInfo.each(function () {
    if (isSubtitled) return;
    isSubtitled = getDescriptionAccessibility(getText($(this))).subtitled;
  });

  const movieBlurb = getText($(".Rich-text")).toLowerCase();
  const hasAudioDescription =
    movieBlurb.includes("Audio Description available at all screenings") ||
    movieBlurb.includes("Audio Description is available at this screening");

  const presentedMatch = movieBlurb.match(
    /The screenings on\s+(.+?)\s+will be presented with([^.]+)\./i,
  );
  let accessibilityMapping = {};
  if (presentedMatch) {
    const times = splitConjoinedItemsInList(convertToList(presentedMatch[1]));
    const accessibilityFeature = presentedMatch[2].toLowerCase();
    accessibilityMapping = times.reduce((mapping, time) => {
      const key = time.trim();
      mapping[key] = mapping[key] || {};
      mapping[key].hardOfHearing = accessibilityFeature.includes(
        "descriptive subtitles",
      );
      return mapping;
    }, accessibilityMapping);
  }

  const showPerformances = [];
  for (const performance of performances) {
    const $ = cheerio.load(performance);
    const key =
      `${getText($(".start-date")).replace(/\d{4}/, "")} ${getText($(".item-venue"))}`
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    showPerformances.push(
      createPerformance({
        url,
        screen: getText($(".item-venue")),
        notesList: [],
        date: parseDate(getText($(".start-date"))),
        status: {
          soldOut: $(".item-link").hasClass("soldout"),
        },
        accessibility: createAccessibility(
          title,
          {
            audioDescription: hasAudioDescription,
            subtitled: isSubtitled,
            ...accessibilityMapping[key],
          },
          overview,
        ),
        // The shared Rich-text blurb describes format options across both BFI
        // venues, so it can't be trusted per-screening — format comes from the
        // title plus the venue-level default (every BFI IMAX screening is IMAX).
        format: createFormat(title, venueFormat),
      }),
    );
  }

  // Patch: the BFI calendar occasionally renders a performance without a
  // booking link, so retrieve skips it and it never reaches `performances`. The
  // film page embeds a (capped, first-few) `searchResults` array, so if the
  // missing performance happens to be in it we can recover it. Remove this once
  // we move BFI to a better data source.
  return showPerformances.concat(
    getRecoveredPerformances(performances, {
      html,
      url,
      title,
      overview,
      hasAudioDescription,
      isSubtitled,
      accessibilityMapping,
      venueFormat,
    }),
  );
}

// Build performances that are present in the film page's `searchResults` array
// but missing from the calendar (identified by their context id, which the
// calendar exposes on each booking link). The film page's `searchResults` is
// always scoped to this film, so any row we don't already have belongs here.
function getRecoveredPerformances(
  performances,
  {
    html,
    url,
    title,
    overview,
    hasAudioDescription,
    isSubtitled,
    accessibilityMapping,
    venueFormat,
  },
) {
  const seenContextIds = new Set(
    performances.map((performance) =>
      getContextId(cheerio.load(performance)("a.more-info").attr("href")),
    ),
  );

  const recovered = [];
  for (const row of extractSearchResults(html)) {
    const contextId = row[SEARCH_RESULT_CONTEXT_ID];
    const startDate = row[SEARCH_RESULT_START_DATE];
    const screen = row[SEARCH_RESULT_SCREEN];
    // Skip rows we can't fully reconstruct or that we already have.
    if (!contextId || !startDate || !screen) continue;
    if (seenContextIds.has(contextId)) continue;
    seenContextIds.add(contextId);

    const key = `${startDate.replace(/\d{4}/, "")} ${screen}`
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    recovered.push(
      createPerformance({
        url,
        screen,
        // The calendar is the source of truth for sold-out status; a recovered
        // performance has no booking link so we can't know it — default to not
        // sold out rather than hide the screening entirely.
        status: { soldOut: false },
        date: parseDate(startDate),
        accessibility: createAccessibility(
          title,
          {
            audioDescription: hasAudioDescription,
            subtitled: isSubtitled,
            ...accessibilityMapping[key],
          },
          overview,
        ),
        format: createFormat(title, venueFormat),
      }),
    );
  }
  return recovered;
}

async function transform(attributes, { moviePages }, sourcedEvents) {
  const { domain } = attributes;
  const shows = [];

  // The BFI IMAX is a single-screen IMAX cinema, so every screening there is an
  // IMAX presentation. This is a venue-level fact that can't be read from the
  // title (the "BFI IMAX" venue name is deliberately not matched as a format).
  const venueFormat =
    attributes.id === "bfi.org.uk-imax" ? { presentation: "imax" } : {};

  for (const showPath in moviePages) {
    const url = `${domain}${showPath}`;
    const show = moviePages[showPath];
    const $ = cheerio.load(show.html);
    const articleId = new URL(url).searchParams.get(
      "BOparam::WScontent::loadArticle::article_id",
    );

    if (!articleId) throw new Error(`Unable to get articleId on ${showPath}`);

    const $articleBody = $(".main-article-body");
    $articleBody.find(".Breadcrumbs,.Booking").remove();
    const overview = $articleBody
      .children()
      .map((i, el) => getText($(el)))
      .get()
      .join("\n");

    const showingId = generateShowingId(attributes, articleId);
    const performances = getPerformancesFor(
      $,
      url,
      show,
      overview,
      venueFormat,
    );

    // Sometimes the same show can be on different URLs with the same ID.
    // Detect this by finding existing showings and adding performances instead
    // of creating a new one with a duplicate showing ID.
    const existingShow = shows.find((show) => show.showingId === showingId);
    if (existingShow) {
      existingShow.performances =
        existingShow.performances.concat(performances);
      continue;
    }

    shows.push({
      showingId,
      title: show.title,
      url,
      overview: getOverviewFor($),
      performances,
      matchingHints: { overview },
    });
  }

  if (shows.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  // Remove duplicate showings at the same time in the same screen. This
  // fixes the issue where BFI's paginated search results lists the same
  // performance on more than one page.
  for (const show of shows) {
    show.performances = Object.values(
      show.performances.reduce(
        (mapping, performance) => ({
          ...mapping,
          [`${performance.time}-${performance.screen}`]: performance,
        }),
        {},
      ),
    );
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return shows.concat(listOfSourcedEvents);
}

module.exports = transform;
