const cheerio = require("cheerio");
const {
  createOverview,
  getText,
  createPerformance,
  createAccessibility,
  createFormat,
  getValidFormat,
  convertToList,
  splitConjoinedItemsInList,
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

// BFI states the print/presentation for a whole listing in the Film-info panel
// (e.g. "IMAX 70mm", "70mm", "IMAX with Laser", "Digital 4K"). This is a
// structured, listing-level fact, unlike the prose blurb which describes the
// film's format in general and leaks across a venue's 70mm/digital variants of
// the same film. We tokenise only that panel and keep the recognised tokens
// (getValidFormat drops "Laser", "Digital", "4K", cast, certificate, etc.).
function getListingFormat($) {
  return getText($("ul.Film-info__information"))
    .split(/[^a-z0-9]+/i)
    .reduce((format, token) => ({ ...format, ...getValidFormat(token) }), {});
}

function getPerformancesFor($, url, show, overview, venueFormat) {
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
  if (
    searchResults.length > 0 &&
    (startDateColumn === -1 || screenColumn === -1 || availabilityColumn === -1)
  ) {
    throw new Error(`BFI searchNames is missing an expected column on ${url}`);
  }

  // Format applies to every performance under this listing, so resolve it once.
  const listingFormat = { ...venueFormat, ...getListingFormat($) };
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

  return searchResults.map((row) => {
    const startDate = row[startDateColumn];
    // venue_description can carry a location suffix (e.g. "BFI IMAX, Waterloo");
    // keep just the screen name.
    const screen = row[screenColumn].split(",")[0].trim();
    // availability_num is the seat count: 0 = sold out, -1 = unavailable
    // ("Error" on the page). Both mean unbookable, so we mark both sold out.
    const soldOut = Number(row[availabilityColumn]) <= 0;
    const key = `${startDate.replace(/\d{4}/, "")} ${screen}`
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return createPerformance({
      url,
      screen,
      notesList: [],
      date: parseDate(startDate),
      status: { soldOut },
      accessibility: createAccessibility(
        title,
        {
          audioDescription: hasAudioDescription,
          subtitled: isSubtitled,
          ...accessibilityMapping[key],
        },
        overview,
      ),
      format: createFormat(title, listingFormat),
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
