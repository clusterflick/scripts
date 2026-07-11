const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  generateShowingId,
  getValidClassification,
} = require("../../common/utils");
const attributes = require("./attributes");

// Parse "2 hours 15 minutes" or "90 minutes"
function extractDurationInMinutes(durationText) {
  if (!durationText) return undefined;
  const hoursMatch = durationText.match(/(\d+)\s*hour/i);
  const minutesMatch = durationText.match(/(\d+)\s*minute/i);
  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  return hours * 60 + minutes;
}

function extractPerformances($, title, overview) {
  const performances = [];

  $(".date-wrapper").each(function () {
    const $dateWrapper = $(this);

    $dateWrapper.find("time[datetime]").each(function () {
      const $timeElement = $(this);
      const $link = $timeElement.closest("a");
      const hasAccessibility = (title) => {
        return $link.find(`.icon[title="${title}"]`).length > 0 || undefined;
      };

      performances.push(
        createPerformance({
          date: parseISO($timeElement.attr("datetime")),
          url: () => $link.attr("href"),
          accessibility: createAccessibility(
            title,
            {
              hardOfHearing: hasAccessibility("Hard of Hearing screening"),
              relaxed: hasAccessibility("Autism Friendly screening"),
              babyFriendly: hasAccessibility("Watch With Baby"),
            },
            overview,
          ),
          format: createFormat(title, {}, overview),
        }),
      );
    });
  });

  return performances;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [url, html] of Object.entries(moviePages)) {
    const $ = cheerio.load(html);

    const $info = $(".info");
    const getInfoSection = (prefix) => {
      const $section = $info.find(`p:contains("${prefix}")`);
      $section.find("br").replaceWith("\n");
      return getText($section);
    };
    const getNameList = (role) => {
      return $(`[itemprop="${role}"] [itemprop="name"]`)
        .map((i, el) => getText($(el)))
        .get()
        .join(", ");
    };
    const rating = getInfoSection("Rate:");
    const ratingMatch = rating.match(/Rate:\s+([^\s]+)\b/);

    // Generate a unique ID from the URL
    const urlParts = $('link[rel="canonical"]').attr("href").split("/");
    const slub = urlParts.at(-1);
    const title = getText($(".page-title"));
    const overview = getText($(".synopsis p[itemprop='description']"));

    movies.push({
      showingId: generateShowingId(attributes, slub),
      title,
      url,
      overview: createOverview({
        duration: extractDurationInMinutes(getInfoSection("Running Time:")),
        categories: getInfoSection("Genre:").replace(/Genre:\s*/i, ""),
        classification: getValidClassification(ratingMatch?.[1]),
        directors: getNameList("director"),
        actors: getNameList("actors"),
        trailer: $('meta[itemprop="embedURL"]').attr("content"),
      }),
      performances: extractPerformances($, title, overview),
      matchingHints: { overview },
    });
  }

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
