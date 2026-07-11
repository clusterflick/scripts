const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  convertToList,
  generateShowingId,
} = require("../../common/utils");

const getEntry = (attributes, $el, movieAdditionalData) => {
  const url = `${attributes.domain}${$el.find(".tile-details > a").attr("href")}`;
  const id = url.match(/\/programme\/([^/]+)\//i)[1];
  const showingId = generateShowingId(attributes, id);
  const title = getText($el.find(".tile-name"));
  const overview = movieAdditionalData[url];

  // It's unexpected to not find a overview information, so throw
  if (!overview) throw new Error("No overview information");

  return {
    showingId,
    title,
    url,
    overview,
    performances: [],
    matchingHints: { overview: getText($el.find(".tile-subname")) },
  };
};

async function getAdditionalDataFor(moviePages) {
  return Object.keys(moviePages).reduce((mapping, url) => {
    const $ = cheerio.load(moviePages[url]);

    const data = createOverview({
      duration: getText($(".film-duration")).replace("mins", ""),
      directors: getText($(".meta .meta-line .film-director")),
      actors: getText($(".meta .meta-line .film-cast")),
      classification: $(".bbfc img").attr("alt")?.replace("BBFC ", "")?.trim(),
    });

    return { ...mapping, [url]: data };
  }, {});
}

// Fix for issue in one of the listings where the <i> tag wasn't closed
// correctly. This tagsoup causes issues when parsing the markup.
// We don't need these tags, so let's just remove them!
function fixMarkup(movieListPage) {
  return movieListPage.replaceAll("<i>", "").replaceAll("</i>", "");
}

async function transform(
  attributes,
  { movieListPage, moviePages },
  sourcedEvents,
) {
  const $ = cheerio.load(fixMarkup(movieListPage));
  const $listEntry = $("#slim-tiles").children();

  const movieAdditionalData = await getAdditionalDataFor(moviePages);
  const movies = {};

  $listEntry.each(function () {
    const $entry = $(this);
    if ($entry.hasClass("date")) return;

    // Ignore the intro text element
    if ($entry.hasClass("intro")) return;

    const id = $entry.attr("data-prog-id");
    if (!id) throw new Error("No listing ID found");

    if (!movies[id]) {
      movies[id] = getEntry(attributes, $entry, movieAdditionalData);
    }

    const $performanceLinks = $entry.find(".film-times a");
    $performanceLinks.each(function () {
      const $link = $(this);

      // Remove hidden text
      $link.children().filter(function () {
        if ($(this).css("display") === "none") {
          $(this).remove();
        }
      });

      const status = { soldOut: false };
      let notesList = [getText($link.find(".screening-type"))];
      if ($link.find(".sold-out").length > 0) {
        status.soldOut = true;
      } else if ($link.find(".last-few").length > 0) {
        notesList.push("Last few seats");
      }

      const filters = convertToList($link.data("filters").toLowerCase());
      const accessibility = {
        audioDescription: filters.includes("audio-described"),
        babyFriendly: filters.includes("parent-baby"),
        hardOfHearing: filters.includes("hard-of-hearing"),
        relaxed: filters.includes("relaxed"),
        subtitled: filters.includes("hard-of-hearing"),
      };

      movies[id].performances = movies[id].performances.concat(
        createPerformance({
          date: parseISO($link.attr("data-start-time")),
          notesList,
          url: `${attributes.domain}${$link.attr("href")}`,
          screen: getText($link.find(".screen")),
          status,
          accessibility: createAccessibility(
            movies[id].title,
            accessibility,
            movies[id].matchingHints.overview,
          ),
          format: createFormat(
            movies[id].title,
            {},
            movies[id].matchingHints.overview,
          ),
        }),
      );
    });
  });

  if (Object.keys(movies).length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return Object.values(movies).concat(listOfSourcedEvents);
}

module.exports = transform;
