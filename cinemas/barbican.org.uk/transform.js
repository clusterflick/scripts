const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
} = require("../../common/utils");
const {
  convertDurationStringToMinutes,
  getYear,
  getDirectorDuration,
} = require("./utils");

const convertSummaryToMapping = ($) => {
  const summary = {};
  $(".at-a-glance-row").each(function () {
    const $key = $(this).find("strong");
    const key = getText($key).toLowerCase().replace(":", "").trim();
    // Remove the key element so we can extract the value
    $key.remove();
    summary[key] = getText($(this));
  });
  return summary;
};

const convertFootnotesToMapping = ($) => {
  let footnotes = {};
  $(".further-credits p, .footnote p").each(function () {
    const footnoteContents = getText($(this));
    const year = getYear(footnoteContents);
    if (year) {
      const directorDuration = getDirectorDuration(footnoteContents);
      footnotes = { ...footnotes, ...directorDuration, year };
    }
  });
  return footnotes;
};

const convertMovieBlurbToDirectors = ($) => {
  // If we can't find a director in formatted spots, try and scan the blurb
  const movieBlurb = getText($(".js-show-more-content"));
  return movieBlurb.match(/Directed\s+by\s+(?:.+?\s+)?(\w+\s+\w+)\s+\(/i)?.[1];
};

function processListingPage(data) {
  const $ = cheerio.load(data);

  const summary = convertSummaryToMapping($);
  const footnotes = convertFootnotesToMapping($);
  const movieBlurbDirectors = convertMovieBlurbToDirectors($);

  const $title = $(".heading-group__primary");
  let title = getText($title);
  const $titleSpecific = $title.find("> span");
  if ($titleSpecific.length > 0) title = getText($titleSpecific.eq(0));

  return {
    url: $('link[rel="canonical"]').attr("href"),
    title,
    venue: getText($("#venue").parent()),
    overview: createOverview({
      duration: summary.runtime
        ? convertDurationStringToMinutes(summary.runtime)
        : footnotes.duration,
      year: summary["release year"] || footnotes.year,
      directors: summary.director || footnotes.director || movieBlurbDirectors,
      classification: getText($("._classification"))
        .replace(/[()]/g, "")
        .trim(),
    }),
  };
}

function processPerformancePage(data, fallbackUrl, fallbackScreen) {
  const $ = cheerio.load(data);

  const performances = [];
  $(".instance-listing").each(function () {
    const $bookingButton = $(this).find(".instance-listing__button a");

    const status = {
      soldOut: getText($bookingButton).toLowerCase() === "sold out",
    };

    const tags = getText($(this).find(".instance-accessibility-tags"))
      .split(/\s+/)
      .map((tag) => tag.trim().toLowerCase());
    const accessibility = createAccessibility({
      audioDescription: tags.includes("ad"),
      relaxed: tags.includes("rel"),
      hardOfHearing: tags.includes("cap"),
    });

    const dateTime = $(this).find(".instance-time__time time").attr("datetime");
    const screen = getText($(this).find(".instance-listing__venue"));
    performances.push(
      createPerformance({
        date: parseISO(dateTime),
        url: $bookingButton.attr("href") || fallbackUrl,
        screen: screen || fallbackScreen,
        status,
        accessibility,
      }),
    );
  });
  return performances;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = moviePages.map(
    ({ title: searchTitle, listingPage, performancePage }) => {
      const {
        url,
        title: listingPageTitle,
        venue,
        overview,
      } = processListingPage(listingPage);
      const performances = processPerformancePage(performancePage, url, venue);
      const useFallbackTitle = searchTitle.endsWith("..") && listingPageTitle;
      const title = useFallbackTitle ? listingPageTitle : searchTitle;
      return {
        title,
        url,
        overview,
        performances,
      };
    },
  );

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return Object.values(movies).concat(listOfSourcedEvents);
}

module.exports = transform;
