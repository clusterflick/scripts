const cheerio = require("cheerio");
const slugify = require("slugify");
const {
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const { domain } = require("./attributes");

function getAdditionalDataFor(data) {
  const $ = cheerio.load(data);

  const addiitionalData = {};

  $(".container .grid h1")
    .parent()
    .find("p")
    .each(function () {
      const contents = getText($(this));

      const categories = contents.match(/Genre:\s+(.*)$/i);
      if (categories) addiitionalData.categories = categories[1];

      const directors = contents.match(/Directed by:\s+(.*)$/i);
      if (directors) addiitionalData.directors = directors[1];

      const actors = contents.match(/Starring:\s+(.*)$/i);
      if (actors) addiitionalData.actors = actors[1];
    });

  return addiitionalData;
}

async function transform({ movieListPage, moviePages }, sourcedEvents) {
  const $ = cheerio.load(movieListPage);
  const $days = $(".whatson_panel");

  const movies = {};
  $days.each(function () {
    const dayId = $(this).attr("id").replace("panel_", "");
    const [, year, month, day] = dayId.match(/^(\d{4})(\d{2})(\d{2})$/);

    const $movieShowings = $(this).find("> div > div");
    $movieShowings.each(function () {
      const $titleInfo = $(this).find("h2");
      const title = getText($titleInfo.find("a"));
      const id = slugify(title);

      if (!movies[id]) {
        const urlPath = $titleInfo.find("a").attr("href");
        const movieUrl = `${domain}/${urlPath}`;

        const $duration = $titleInfo.parent().next();
        const durationMatch = getText($duration).match(
          /^Running time:\W+(\d+)\W*mins$/,
        );
        const ageRestriction = $titleInfo.next().attr("alt");
        const $trailerLink = $(this).find(".text-right a.text-black");
        const youtubeCall = $trailerLink.attr("onclick").trim();
        const youtubeMatch = youtubeCall.match(/^showTrailer\('(\w+)'\)$/);

        const overview = createOverview({
          duration: durationMatch[1],
          classification: ageRestriction,
          trailer: youtubeMatch
            ? `https://www.youtube.com/watch?v=${youtubeMatch[1]}`
            : undefined,
          ...getAdditionalDataFor(moviePages[movieUrl]),
        });

        movies[id] = {
          // Fix for special characters not encoding correctly in calendar
          title: title.replace(/’/g, "'").replace(/–/g, "-"),
          url: movieUrl,
          overview,
          performances: [],
        };
      }

      const $performances = $titleInfo
        .parent()
        .parent()
        .find("a.perfButton,span.perfButton");

      $performances.each(function () {
        $performance = $(this);
        const $bookingButton =
          $performance.children().length > 0
            ? $performance.children().last()
            : $performance;

        const [hours, minutes] = getText($bookingButton).split(":");

        const notesList = [];
        // TODO: Are these still part of the site?
        $performance.find("i").each(function () {
          const indicatorClass = $(this).attr("class").trim();
          const indicator = indicatorClass.match(/\ba1-event-(\w+)\b/);
          if (indicator) notesList.push(indicator[1]);
        });

        const status = {
          soldOut: !$performance.attr("href"),
        };
        const accessibility = {};
        let screen = undefined;

        const $iconImage = $performance.children().first().find("img");
        if ($iconImage) {
          const alt = $iconImage.attr("alt");
          if (alt) {
            const iconType = alt.replace(" icon", "")?.trim();
            if (iconType.toLowerCase() === "subtitled") {
              accessibility.hardOfHearing = true;
            } else if (iconType.toLowerCase() === "parent & baby") {
              accessibility.babyFriendly = true;
            } else if (iconType.toLowerCase() === "bar") {
              screen = "Bar";
            } else {
              notesList.push(iconType);
            }
          }
        }

        movies[id].performances = movies[id].performances.concat(
          createPerformance({
            date: parseDate(`${year}-${month}-${day} ${hours}:${minutes}`),
            notesList,
            url: $performance.attr("href") || movies[id].url,
            screen,
            status,
            accessibility: createAccessibility(accessibility),
          }),
        );
      });
    });
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return Object.values(movies).concat(listOfSourcedEvents);
}

module.exports = transform;
