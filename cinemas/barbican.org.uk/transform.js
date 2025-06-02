const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
  basicNormalize,
  generateShowingId,
} = require("../../common/utils");
const {
  convertDurationStringToMinutes,
  getYear,
  getDirectorDuration,
} = require("./utils");
const attributes = require("./attributes");

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

  const eventId = `${$("button.saved-event-button").data("saved-event-id")}`;
  const showingId = generateShowingId(attributes, eventId);
  const $title = $(".heading-group__primary");
  let title = getText($title);
  const $titleSpecific = $title.find("> span");
  if ($titleSpecific.length > 0) title = getText($titleSpecific.eq(0));

  const $aboutTheFilm = $("#about-the-film").parents(".container").next();
  const aboutDirectorDuration = getDirectorDuration(
    getText($aboutTheFilm.find("p").last()),
  );
  const aboutMovie = getText($aboutTheFilm);
  const aboutListing = getText($("#about").next());
  const releaseYear = summary["release year"]?.match(/^\d{4}$/)
    ? summary["release year"]
    : null;

  return {
    showingId,
    title,
    url: $('link[rel="canonical"]').attr("href"),
    venue: getText($("#venue").parent()),
    overview: createOverview({
      duration: summary.runtime
        ? convertDurationStringToMinutes(summary.runtime)
        : footnotes.duration || aboutDirectorDuration.duration,
      year: releaseYear || footnotes.year,
      directors:
        summary.director ||
        footnotes.director ||
        aboutDirectorDuration.director ||
        movieBlurbDirectors,
      classification: getText($("._classification"))
        .replace(/[()]/g, "")
        .trim(),
    }),
    matchingHints: { overview: aboutMovie || aboutListing },
  };
}

function getListingTags(data) {
  const $ = cheerio.load(data);
  return $(".tag-buttons .tag-button")
    .map((i, el) => getText($(el)))
    .get()
    .filter(
      (tag) =>
        basicNormalize(tag) !== "cinema" &&
        basicNormalize(tag) !== "new releases" &&
        basicNormalize(tag) !== "more..." &&
        basicNormalize(tag) !== "barbican presents",
    );
}

function processPerformancePage(
  data,
  listingPage,
  fallbackUrl,
  fallbackScreen,
) {
  const $ = cheerio.load(data);
  const listingTags = getListingTags(listingPage);

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
      relaxed:
        tags.includes("rel") ||
        !!listingTags.find((tag) =>
          basicNormalize(tag).includes("relaxed screening"),
        ),
      hardOfHearing: tags.includes("cap"),
      babyFriendly: !!listingTags.find((tag) =>
        basicNormalize(tag).includes("parent and baby"),
      ),
    });

    const dateTime = $(this).find(".instance-time__time time").attr("datetime");
    const screen = getText($(this).find(".instance-listing__venue"));
    const notesList = listingTags.filter(
      (tag) =>
        !basicNormalize(tag).includes("parent and baby") &&
        !basicNormalize(tag).includes("relaxed screening"),
    );
    performances.push(
      createPerformance({
        date: parseISO(dateTime),
        notesList,
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
        showingId,
        title: listingPageTitle,
        url,
        venue,
        overview,
        matchingHints,
      } = processListingPage(listingPage);
      const performances = processPerformancePage(
        performancePage,
        listingPage,
        url,
        venue,
      );
      const useFallbackTitle = searchTitle.endsWith("..") && listingPageTitle;
      const title = useFallbackTitle ? listingPageTitle : searchTitle;
      return {
        showingId,
        title,
        url,
        overview,
        performances,
        matchingHints,
      };
    },
  );

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return Object.values(movies).concat(listOfSourcedEvents);
}

module.exports = transform;
