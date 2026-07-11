const path = require("node:path");
const cheerio = require("cheerio");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  getText,
  createAccessibility,
  createFormat,
  readJSON,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const { parseDate } = require("../../common/bfi.org.uk/utils");
const attributes = require("./attributes");

// Indices within each articleContext.searchResults entry (confirmed from live data)
const RESULT_DATETIME = 7; // "Friday 20 March 2026 15:30"
const RESULT_YEAR = 11; // "2026"
const RESULT_BOOKING_URL = 18; // "default.asp?doWork::WScontent..."
const RESULT_SCREEN_FULL_NAME = 64; // "BFI Southbank, Screen NFT1"

function getOverviewText($) {
  const $articleBody = $(".main-article-body").clone();
  $articleBody.find(".Breadcrumbs,.Booking").remove();
  $articleBody
    .find(".Film-info__content__heading")
    .filter(function () {
      return getText($(this)) === "Access screenings";
    })
    .parent()
    .remove();
  for (const heading of ["How to book", "Our programmers recommend..."]) {
    $articleBody
      .find(".Section__heading")
      .filter(function () {
        return getText($(this)) === heading;
      })
      .each(function () {
        const $heading = $(this);
        $heading.next().remove();
        $heading.remove();
      });
  }
  $articleBody.find("script").remove();
  return getText($articleBody)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
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

    if (
      (heading === "director" || heading === "director-screenwriter") &&
      !overview.directors
    ) {
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

function getAccessibilityFlagsForType(typeText) {
  if (typeText === "Relaxed screening") {
    return { relaxed: true };
  }
  if (typeText === "Descriptive Subtitles") {
    return { hardOfHearing: true };
  }
  if (typeText === "BSL" || typeText === "BSL intro / Q&A") {
    return { hardOfHearing: true };
  }
  if (typeText === "Live captioned") {
    return { hardOfHearing: true };
  }
  if (typeText.startsWith("Closed Captions")) {
    return { hardOfHearing: true };
  }
  if (typeText === "Audio Description") {
    return { audioDescription: true };
  }
  console.warn(
    `[bfi.org.uk-bfi-festivals] Unrecognised access screening type: "${typeText}"`,
  );
  return null;
}

function buildAccessibilityByTime($, searchResults) {
  const accessibilityByTime = new Map();

  // Find the "Access screenings" content section
  const $accessHeading = $(".Film-info__content__heading").filter(function () {
    return getText($(this)) === "Access screenings";
  });

  if (!$accessHeading.length) return accessibilityByTime;

  const $content = $accessHeading
    .closest(".Film-info__content")
    .find(".Film-info__content__content");

  // Get year from the first performance entry to parse partial access dates
  const firstResult = searchResults[0];
  if (!firstResult) return accessibilityByTime;
  const year = firstResult[RESULT_YEAR];

  $content.find("p").each(function () {
    const $p = $(this);
    const strongText = getText($p.find("strong"));
    if (!strongText) return;

    // "Wednesday 25 March 16:00" → "Wednesday 25 March 2026 16:00"
    const fullDateStr = strongText.replace(/(\d{2}:\d{2})$/, `${year} $1`);
    let date;
    try {
      date = parseDate(fullDateStr);
    } catch {
      console.warn(
        `[bfi.org.uk-bfi-festivals] Unable to parse access screening date: "${strongText}"`,
      );
      return;
    }

    // Collect flags from all text nodes following a <br>
    let flags = {};
    for (const br of $p.find("br").toArray()) {
      const typeText = br.nextSibling?.data?.trim();
      if (!typeText) continue;
      const brFlags = getAccessibilityFlagsForType(typeText);
      if (brFlags) flags = { ...flags, ...brFlags };
    }

    if (Object.keys(flags).length === 0) return;

    const existing = accessibilityByTime.get(date.getTime()) ?? {};
    accessibilityByTime.set(date.getTime(), { ...existing, ...flags });
  });

  return accessibilityByTime;
}

async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "bfi.org.uk-bfi-festivals",
  );

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const moviePages = data.moviePages ?? {};
  const events = [];

  for (const [articleUrl, movie] of Object.entries(moviePages)) {
    const { html, searchResults, domain, festival } = movie;

    if (!searchResults || searchResults.length === 0) continue;

    const $ = cheerio.load(html);
    const title = searchResults[0][5];

    const isShortFilmCollection = $(".Short__film").length > 1;
    const overview = isShortFilmCollection
      ? createOverview({})
      : getOverviewFor($);

    const overviewText = getOverviewText($);

    const accessibilityByTime = buildAccessibilityByTime($, searchResults);

    const performances = [];
    for (const result of searchResults) {
      const [venueName, screen] = result[RESULT_SCREEN_FULL_NAME].split(", ");
      if (!venueMatchesCinema(cinema, venueName)) continue;

      const date = parseDate(result[RESULT_DATETIME]);
      const accessibilityFlags = accessibilityByTime.get(date.getTime()) ?? {};

      performances.push(
        createPerformance({
          date,
          url: `${domain}${result[RESULT_BOOKING_URL]}`,
          screen,
          notesList: [`Part of the ${festival} festival`],
          accessibility: createAccessibility(
            title,
            accessibilityFlags,
            overviewText,
          ),
          format: createFormat(title, {}, overviewText),
        }),
      );
    }

    if (performances.length === 0) continue;

    const slug = new URL(articleUrl).searchParams.get(
      "BOparam::WScontent::loadArticle::permalink",
    );
    events.push({
      showingId: generateShowingId(attributes, slug),
      title,
      url: articleUrl,
      overview,
      performances,
      matchingHints: { overview: overviewText },
    });
  }

  return events;
}

module.exports = findEvents;
