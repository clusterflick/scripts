const cheerio = require("cheerio");
const {
  createOverview,
  getText,
  createPerformance,
  createAccessibility,
  createFormat,
  getValidFormat,
  generateShowingId,
  getDescriptionAccessibility,
} = require("../utils");
const { parseDate } = require("./utils");

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

// Season films nest one level under a "Seasons" breadcrumb
// (Home / Seasons / <season> / <title>), while the flat programme buckets
// (Big screen classics, New releases, Member exclusives, ...) sit directly
// under Home. Only the former names something worth telling the audience, so
// anchor on the "Seasons" crumb and take the segment after it rather than
// reading whatever happens to sit above the film.
const SEASONS_BREADCRUMB_HREF = "article/seasons";

function getSeasonFor($) {
  const items = $(".Breadcrumbs__item").toArray();
  const seasonsIndex = items.findIndex(
    (el) => $(el).find("a").attr("href") === SEASONS_BREADCRUMB_HREF,
  );
  if (seasonsIndex === -1) return undefined;

  // The final crumb is the article's own title, so a "Seasons" crumb directly
  // above it means this page is a season rather than a film within one.
  const seasonIndex = seasonsIndex + 1;
  if (seasonIndex >= items.length - 1) return undefined;

  return getText($(items[seasonIndex])) || undefined;
}

// Each performance's searchResults row carries a comma-separated `keywords`
// field - the venue's own per-performance markers (e.g. "Audio description,
// Closed captions,Digital", "IMAX 70mm"). Accessibility and format are read
// straight from these rather than the shared prose blurb / Film-info panel:
// they're per-performance (so format no longer leaks across a film's 70mm and
// digital screenings) and don't roll an event-level claim onto every showing.

// Only the accessibility features BFI actually tags as keywords; anything else
// is a false negative we accept rather than guess at. Note descriptive
// subtitles are for the D/deaf (hardOfHearing), not a foreign-language subtitle.
const keywordAccessibilityMatchers = [
  { regex: /audio description/i, key: "audioDescription" },
  { regex: /closed captions?/i, key: "hardOfHearing" },
  { regex: /descriptive subtitles/i, key: "hardOfHearing" },
];

function getKeywordAccessibility(keywords) {
  const accessibility = {};
  for (const keyword of keywords) {
    for (const { regex, key } of keywordAccessibilityMatchers) {
      if (regex.test(keyword)) accessibility[key] = true;
    }
  }
  return accessibility;
}

// Read the recognised format tokens off each keyword (getValidFormat drops
// "Digital", "Releases", "IMAX with Laser", etc.). A keyword is matched both by
// its individual words ("IMAX" -> presentation) and as a whole phrase, with the
// phrase spread last so a multi-word token like "IMAX 70mm" (a distinct 15/70
// source) wins over the bare "70mm" its words would otherwise yield.
function getKeywordFormat(keywords) {
  return keywords.reduce((format, keyword) => {
    const wordFormat = keyword
      .split(/[^a-z0-9]+/i)
      .reduce((acc, word) => ({ ...acc, ...getValidFormat(word) }), {});
    return { ...format, ...wordFormat, ...getValidFormat(keyword) };
  }, {});
}

function getPerformancesFor($, url, show, venueFormat, season) {
  const { title, articleContext } = show;

  // Performances arrive as raw `searchResults` rows - positional arrays whose
  // fields are named by `searchNames`. Resolve the columns we need by name so
  // we're resilient to BFI reordering them. An article with no performances
  // (passed run, non-film index entry) omits `searchResults` entirely.
  const searchResults = articleContext.searchResults || [];
  const searchNames = articleContext.searchNames || [];
  const startDateColumn = searchNames.indexOf("start_date");
  const screenColumn = searchNames.indexOf("venue_description");
  const availabilityColumn = searchNames.indexOf("availability_num");
  const keywordsColumn = searchNames.indexOf("keywords");
  if (
    searchResults.length > 0 &&
    (startDateColumn === -1 ||
      screenColumn === -1 ||
      availabilityColumn === -1 ||
      keywordsColumn === -1)
  ) {
    throw new Error(`BFI searchNames is missing an expected column on ${url}`);
  }

  // Foreign-language subtitles are a property of the film (all its screenings),
  // stated in the Film-info panel - genuinely listing-level, unlike the
  // per-performance accessibility keywords below.
  const $showInfo = $("ul.Film-info__information li");
  let isSubtitled = false;
  $showInfo.each(function () {
    if (isSubtitled) return;
    isSubtitled = getDescriptionAccessibility(getText($(this))).subtitled;
  });

  return searchResults.map((row) => {
    const startDate = row[startDateColumn];
    // venue_description can carry a location suffix (e.g. "BFI IMAX, Waterloo");
    // keep just the screen name.
    const screen = row[screenColumn].split(",")[0].trim();
    // availability_num is the seat count: 0 = sold out, -1 = unavailable
    // ("Error" on the page). Both mean unbookable, so we mark both sold out.
    const soldOut = Number(row[availabilityColumn]) <= 0;
    const keywords = (row[keywordsColumn] || "")
      .split(",")
      .map((k) => k.trim());
    return createPerformance({
      url,
      screen,
      notesList: season ? [`Part of ${season}`] : [],
      date: parseDate(startDate),
      status: { soldOut },
      accessibility: createAccessibility(title, {
        subtitled: isSubtitled,
        ...getKeywordAccessibility(keywords),
      }),
      format: createFormat(title, {
        ...venueFormat,
        ...getKeywordFormat(keywords),
      }),
    });
  });
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
    // Read before the breadcrumbs are stripped out of the article body below.
    const season = getSeasonFor($);
    $articleBody.find(".Breadcrumbs,.Booking").remove();
    const overview = $articleBody
      .children()
      .map((i, el) => getText($(el)))
      .get()
      .join("\n");

    const showingId = generateShowingId(attributes, articleId);
    const performances = getPerformancesFor($, url, show, venueFormat, season);

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

  // Remove duplicate showings at the same time in the same screen. Belt and
  // braces now that performances come from a single authoritative fetch, but it
  // also collapses the case where the same show is split across two URLs.
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
