const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  getText,
  createOverview,
  createPerformance,
  basicNormalize,
  createAccessibility,
  createFormat,
  getTitleFormat,
  generateShowingId,
  getId,
} = require("../utils");

const getMinutes = (duration) => {
  if (!duration) return undefined;

  const match = duration.match(/^(?:(\d+)hrs?\s+)?(\d+)mins?$/);
  if (!match) return undefined;

  const [, hours = 0, minutes] = match;
  return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
};

const getOverview = ($, $movieData) => {
  const classification = $movieData
    .find(".cert-40")
    .attr("src")
    ?.match(/BBFC_([^_]+)_RBG\./i)?.[1];

  const $details = $movieData.find(".row").eq(0).find("p");
  const details = {};
  $details.each(function (index) {
    const isKey = index % 2 === 0;
    if (isKey) return;

    const key = getText($(this).prev()).replace(":", "").toLowerCase();
    details[key] = getText($(this));
  });

  return createOverview({
    categories: details.genre,
    duration: getMinutes(details.duration),
    directors: details.director,
    actors: details.starring,
    classification,
  });
};

const getPerformances = ($, attributes, performanceData, title, overview) => {
  const performances = performanceData.reduce((performances, { el, data }) => {
    if (data["@type"] !== "Event") return performances;
    const $button = $(el).prev();
    const tags = $button
      .find("span.ms-2")
      .map((i, el) => getText($(el)))
      .get();

    const notesList = tags.filter(
      (tag) =>
        basicNormalize(tag) !== "subtitled" &&
        basicNormalize(tag) !== "babes in arms" &&
        basicNormalize(tag) !== "sold out",
    );

    // Record 3D screenings as a structured format rather than a note
    const format = {};
    if ($button.find(".bi-badge-3d-fill").length > 0) {
      format.dimension = "3d";
    }

    // The cert-16 badge is a per-screening format marker whose alt text is a
    // compound label (e.g. "Movie Sound Dolby Cinema"); extract any recognised
    // format from it as structured data, otherwise keep the label as a note.
    if ($button.find("img.cert-16").length > 0) {
      const alt = $button.find("img.cert-16").eq(0).attr("alt");
      const altFormat = getTitleFormat(alt);
      if (Object.keys(altFormat).length > 0) {
        Object.assign(format, altFormat);
      } else {
        notesList.push(alt);
      }
    }

    return performances.concat(
      createPerformance({
        date: parseISO(data.startDate),
        notesList,
        url: data.offers.url,
        status: { soldOut: tags.includes("Sold Out") },
        screen:
          basicNormalize(data.location.name) !== basicNormalize(attributes.name)
            ? data.location.name
            : undefined,
        accessibility: createAccessibility(
          title,
          {
            subtitled: tags.includes("Subtitled"),
            babyFriendly: tags.includes("Babes in Arms"),
          },
          overview,
        ),
        format: createFormat(title, format, overview),
      }),
    );
  }, []);

  // There may be more than one performance in the page (hidden depending on
  // page size). Filter out any duplicates.
  return Object.values(
    performances.reduce(
      (mapping, performance) => ({
        ...mapping,
        [performance.time]: performance,
      }),
      {},
    ),
  );
};

async function transform(attributes, { moviePages }, sourcedEvents) {
  const movies = [];

  for (const moviePageUrl in moviePages) {
    const moviePage = moviePages[moviePageUrl];
    const $ = cheerio.load(moviePage);
    const structuredData = $('script[type="application/ld+json"]')
      .map((i, el) => ({ el, data: JSON.parse(getText($(el))) }))
      .get();
    const $listingData = $("#section_3_stack");
    const $title = $listingData.find("h3").eq(0);
    const $synopsis = $listingData.find("h3").eq(1).next();
    const id = getId(moviePageUrl.split("/film/")[1]);
    const title = getText($title);
    const overview = getText($synopsis);
    movies.push({
      showingId: generateShowingId(attributes, id),
      title,
      url: moviePageUrl,
      overview: getOverview($, $title.parent()),
      performances: getPerformances(
        $,
        attributes,
        structuredData,
        title,
        overview,
      ),
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
