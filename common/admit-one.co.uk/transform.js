const cheerio = require("cheerio");
const nlp = require("compromise");
const {
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
  generateShowingId,
  basicNormalize,
} = require("../../common/utils");
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
  const cleaned = synopsis
    // Strip credited role lines (e.g. "by Arthur Miller", "Directed by Ivo Van Hove")
    // to avoid extracting playwrights/directors/designers as cast
    .replace(/^(?:by|directed by|design by|written by|adapted by)\s+.+$/gim, "")
    // Strip parenthetical content (e.g. "(Breaking Bad)") to prevent
    // the NLP library from treating film/show titles as person names
    .replace(/\([^)]*\)/g, "");
  const doc = nlp(cleaned);
  const people = doc.people().json();
  if (people.length === 0) return;

  return people
    .map(({ text }) => text.replace(/[.,]+$/, "").trim())
    .filter(
      (name) =>
        (name && !name.includes("'s") && !name.includes("’s")) ||
        basicNormalize(name) === "shakespeare" ||
        basicNormalize(name).startsWith("tony award"),
    );
}

function getCharacters(synopsis) {
  const doc = nlp(synopsis);
  const people = doc.people().json();
  if (people.length === 0) return;

  return people.reduce((characters, { text }) => {
    // make sure it's at least first + last name. Won't work for all movies
    // but solves the immediate problem based on the synopsis from this cinema
    if (!text.includes(" ")) return characters;
    return characters.concat(text.replace(/,/g, ""));
  }, []);
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
        let screen = undefined;

        const $iconImage = $performance.children().first().find("img");
        if ($iconImage) {
          const alt = $iconImage.attr("alt");
          if (alt) {
            const iconType = alt.replace(" icon", "")?.trim();
            if (iconType.toLowerCase() === "subtitled") {
              accessibility.subtitled = true;
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
            accessibility: createAccessibility(
              title,
              accessibility,
              movies[id].matchingHints?.overview || "",
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
