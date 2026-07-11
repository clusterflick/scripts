const {
  createOverview,
  createPerformance,
  generateShowingId,
  createAccessibility,
  createFormat,
} = require("../utils");

async function transform(attributes, { moviePages }, sourcedEvents) {
  const movies = [];

  for (const [movieUrl, moviePage] of Object.entries(moviePages)) {
    // Extract the SOFTIX['GAData'] JSON blob from the HTML
    const dataJsonMatch = moviePage.match(
      /\s*SOFTIX\['GAData'\]\s+=\s+([\s\S]+?)\s+"UpsellShows":/i,
    );
    const data = JSON.parse(`${dataJsonMatch[1]} "UpsellShows":null}`);
    const showingUrl = new URL(movieUrl);
    const showCode = showingUrl.searchParams.get("sh");

    // Skip if this is an empty entry
    if (!data.Show) continue;

    // Skip if this is an "umbrella" show (e.g a grouping page for add-ons)
    if (data.Show.Type === "UmbrellaShow") continue;

    const performances = [];
    for (const venue of data.Show.Venues) {
      for (const performance of venue.Performances) {
        performances.push(
          createPerformance({
            date: new Date(performance.DateTimeOffset),
            url: performance.Url || movieUrl,
            accessibility: createAccessibility(data.Show.Name, {}),
            format: createFormat(data.Show.Name, {}, ""),
          }),
        );
      }
    }

    const movie = {
      showingId: generateShowingId(attributes, showCode),
      title: data.Show.Name,
      url: movieUrl,
      overview: createOverview({}),
      performances,
      matchingHints: {},
    };

    movies.push(movie);
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
