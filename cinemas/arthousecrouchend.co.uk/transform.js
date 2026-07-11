const cheerio = require("cheerio");
const { format } = require("date-fns");
const {
  createOverview,
  getText,
  generateShowingId,
  basicNormalize,
  createPerformance,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { extractPeopleNames } = require("../../common/extract-people");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

function getAccessibilityFrom(rawNote) {
  const note = basicNormalize(rawNote);
  if (note.includes("subtitled")) return { subtitled: true };
  if (note.includes("baby & carer")) return { babyFriendly: true };
  return undefined;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = Object.keys(moviePages).map((movieUrl) => {
    const id = new URLSearchParams(new URL(movieUrl).search).get(
      "programme_id",
    );
    const moviePage = moviePages[movieUrl];
    const $ = cheerio.load(moviePage);
    const title = getText($(".prog-title"));
    const youtubeId = $(".ytvideo").data("video");
    const accessibilityFromSynopsis = {};
    const commonPerformanceNotes = [];
    $(".synopsis > p").each(function () {
      const content = getText($(this));
      const match = content.match(/^Please (?:also )?note:(.+)$/);
      if (match) commonPerformanceNotes.push(match[1].trim());
      if (basicNormalize(content).includes("with english subtitles")) {
        accessibilityFromSynopsis.subtitled = true;
      }
    });

    const overview = createOverview({
      duration: getText($(".prog-length")).match(/Length:\s*(\d+)\s*min/i)[1],
      classification: $(".prog-cert > img")
        .data("src")
        .split("/")
        .slice(-1)[0]
        .split(".")[0],
      trailer: youtubeId
        ? `https://www.youtube.com/watch?v=${youtubeId}`
        : undefined,
    });

    const synopsis = getText($(".synopsis"));

    const performances = [];
    $(".times").each(function () {
      let day = getText($(this).prev());
      if (basicNormalize(day) === "today") {
        day = format(new Date(), "EEE d LLL");
      }

      const $performanceLinks = $(this).find("a");
      $performanceLinks.each(function () {
        const performanceNote = getText($(this).find(".prog-notes"));
        const accessibilityFromPerformanceNote =
          getAccessibilityFrom(performanceNote);
        $(this).find(".prog-notes").remove();
        $(this).find(".OpenForSale").remove();
        const time = getText($(this).find(".prog-times"));
        performances.push(
          createPerformance({
            date: parseDate(`${day} ${time}`),
            notesList: [
              ...commonPerformanceNotes,
              accessibilityFromPerformanceNote ? undefined : performanceNote,
            ],
            url: $(this).attr("href"),
            accessibility: createAccessibility(
              title,
              {
                ...(accessibilityFromPerformanceNote ?? {}),
                ...accessibilityFromSynopsis,
              },
              synopsis,
            ),
            format: createFormat(title, {}, synopsis),
          }),
        );
      });
    });

    return {
      showingId: generateShowingId(attributes, id),
      title,
      url: movieUrl,
      overview,
      performances,
      matchingHints: {
        crew: extractPeopleNames(synopsis),
        overview: synopsis,
      },
    };
  });

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
