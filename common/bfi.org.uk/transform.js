const cheerio = require("cheerio");
const {
  createOverview,
  getText,
  createPerformance,
  createAccessibility,
  convertToList,
  splitConjoinedItemsInList,
  generateShowingId,
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

function getPerformancesFor($, url, { title, performances }) {
  const $showInfo = $("ul.Film-info__information li");
  let isSubtitled = false;
  $showInfo.each(function () {
    if (isSubtitled) return;
    isSubtitled = getText($(this)).toLowerCase().includes(" subtitles");
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
        accessibility: createAccessibility(title, {
          audioDescription: hasAudioDescription,
          subtitled: isSubtitled,
          ...accessibilityMapping[key],
        }),
      }),
    );
  }
  return showPerformances;
}

async function transform(attributes, { moviePages }, sourcedEvents) {
  const { url } = attributes;
  const shows = [];

  for (const showPath in moviePages) {
    const show = moviePages[showPath];
    const $ = cheerio.load(show.html);
    const articleId = $(
      "input[name='BOparam::WScontent::loadArticle::article_id']",
    ).val();

    if (!articleId) throw new Error(`Unable to find articleId on ${url}`);

    const showingId = generateShowingId(attributes, articleId);
    const performances = getPerformancesFor($, `${url}?${showPath}`, show);

    // Sometimes the same show can be on different URLs with the same ID.
    // Detect this by finding existing showings and adding performances instead
    // of creating a new one with a duplicate showing ID.
    const existingShow = shows.find((show) => show.showingId === showingId);
    if (existingShow) {
      existingShow.performances =
        existingShow.performances.concat(performances);
      continue;
    }

    const $articleBody = $(".main-article-body");
    $articleBody.find(".Breadcrumbs,.Booking").remove();
    const overview = $articleBody
      .children()
      .map((i, el) => getText($(el)))
      .get()
      .join("\n");

    shows.push({
      showingId,
      title: show.title,
      url: `${url}?${showPath}`,
      overview: getOverviewFor($),
      performances,
      matchingHints: { overview },
    });
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return shows.concat(listOfSourcedEvents);
}

module.exports = transform;
