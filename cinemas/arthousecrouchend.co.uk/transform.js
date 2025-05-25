const cheerio = require("cheerio");
const { format } = require("date-fns");
const {
  createOverview,
  getText,
  generateShowingId,
  basicNormalize,
  createPerformance,
} = require("../../common/utils");
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
            accessibility: {
              ...(accessibilityFromPerformanceNote ?? {}),
              ...accessibilityFromSynopsis,
            },
          }),
        );
      });
    });

    return {
      showingId: generateShowingId(attributes, id),
      title: getText($(".prog-title")),
      url: movieUrl,
      overview,
      performances,
      matchingHints: {
        overview: getText($(".synopsis")),
      },
    };
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
