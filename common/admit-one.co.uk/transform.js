const cheerio = require("cheerio");
const {
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  getValidFormat,
  generateShowingId,
  basicNormalize,
} = require("../../common/utils");
const { extractPeopleNames } = require("../../common/extract-people");
const { parseDate } = require("./utils");

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

function getOverviewFrom(data) {
  const $ = cheerio.load(data);
  const $details = $(".container .grid h1").parent();
  const $overview = $details.next().find("p");
  $overview.find("*").each(function () {
    $(this).prepend(" ").append(" ");
  });

  const details = getText($details);
  const overview = getText($overview).split("About the festival")[0].trim();
  if (!overview) return null;
  return `${details}\n\n${overview}`
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function getCast(synopsis) {
  const names = extractPeopleNames(synopsis, { stripAttributions: true });
  if (!names) return;

  // Admit One lists theatre events where "Shakespeare" and "Tony Award..."
  // are meaningful crew hints even though the possessive filter would
  // normally discard them.
  return names.filter(
    (name) =>
      basicNormalize(name) === "shakespeare" ||
      basicNormalize(name).startsWith("tony award") ||
      (!name.includes("'s") && !name.includes("’s")),
  );
}

function getCharacters(synopsis) {
  const names = extractPeopleNames(synopsis);
  if (!names) return;

  // Make sure it's at least first + last name. Won't work for all movies
  // but solves the immediate problem based on the synopsis from this cinema.
  return names.filter((name) => name.includes(" "));
}

async function transform(
  attributes,
  { movieListPage, moviePages },
  sourcedEvents,
) {
  const $ = cheerio.load(movieListPage);
  const $days = $(".whatson_panel");

  const movies = {};
  $days.each(function () {
    const dayId = $(this).attr("id").replace("panel_", "");
    const [, year, month, day] = dayId.match(/^(\d{4})(\d{2})(\d{2})$/);

    const $movieShowings = $(this).find("> div > div");
    $movieShowings.each(function () {
      const $titleInfo = $(this).find("h2");
      // Fix for special characters not encoding correctly in calendar
      const title = getText($titleInfo.find("a"))
        .replace(/’/g, "'")
        .replace(/–/g, "-");
      const urlPath = $titleInfo.find("a").attr("href");
      const movieUrl = `${attributes.domain}/${urlPath}`;
      const id = movieUrl.match(/\/event\/([^/]+)$/i)[1];

      if (!movies[id]) {
        const $duration = $titleInfo.parent().next();
        const durationMatch = getText($duration).match(
          /^Running time:\W+(\d+)\W*mins$/,
        );
        const ageRestriction = $titleInfo.next().attr("alt");
        const $trailerLink = $(this).find(".text-right a.text-black");
        const youtubeCall = ($trailerLink.attr("onclick") ?? "").trim();
        const youtubeMatch = youtubeCall.match(/^showTrailer\('(\w+)'\)$/);

        const overview = createOverview({
          duration: durationMatch[1],
          classification: ageRestriction,
          trailer: youtubeMatch
            ? `https://www.youtube.com/watch?v=${youtubeMatch[1]}`
            : undefined,
          ...getAdditionalDataFor(moviePages[movieUrl]),
        });

        let matchingHintsOverview = getOverviewFrom(moviePages[movieUrl]);
        movies[id] = {
          showingId: generateShowingId(attributes, id),
          title,
          url: movieUrl,
          overview,
          performances: [],
          matchingHints: {
            overview: matchingHintsOverview,
            characters: getCharacters(matchingHintsOverview),
            crew: getCast(matchingHintsOverview),
          },
        };
      }

      const $performances = $titleInfo
        .parent()
        .parent()
        .find("a.perfButton,span.perfButton");

      $performances.each(function () {
        const $performance = $(this);
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
        const format = {};
        let screen = undefined;

        const $iconImages = $performance.find("img");
        if ($iconImages.length > 0) {
          const alts = $iconImages
            .map((i, $iconImage) =>
              $($iconImage).attr("alt")?.replace(" icon", "")?.trim(),
            )
            .get()
            .filter(Boolean);
          if (alts.length > 0) {
            alts.forEach((iconType) => {
              if (basicNormalize(iconType) === "subtitled") {
                accessibility.subtitled = true;
              } else if (basicNormalize(iconType) === "parent & baby") {
                accessibility.babyFriendly = true;
              } else if (basicNormalize(iconType) === "bar") {
                screen = "Bar";
              } else if (Object.keys(getValidFormat(iconType)).length > 0) {
                Object.assign(format, getValidFormat(iconType));
              } else {
                notesList.push(iconType);
              }
            });
          }
        }

        movies[id].performances = movies[id].performances.concat(
          createPerformance({
            date: parseDate(`${year}-${month}-${day} ${hours}:${minutes}`),
            notesList,
            url: $performance.attr("href") || movies[id].url,
            screen,
            status,
            accessibility: createAccessibility(
              title,
              accessibility,
              movies[id].matchingHints.overview,
            ),
            format: createFormat(
              title,
              format,
              movies[id].matchingHints.overview,
            ),
          }),
        );
      });
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
