const { format, startOfDay } = require("date-fns");
const {
  createAccessibility,
  createOccasions,
  createFormat,
  createOverview,
  createPerformance,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");
const { parseShowings, parseMoviePage } = require("./utils");

async function transform({ movieListPage, moviePages }, sourcedEvents) {
  const today = startOfDay(new Date());
  const movies = parseShowings(movieListPage).map(({ date, title, url }) => {
    const page = url && moviePages[url];
    if (url && !page && date >= today) {
      throw new Error(`No retrieved page for ${title} (${url})`);
    }
    const { description = "", ticketsRemaining } = page
      ? parseMoviePage(page)
      : {};
    return {
      showingId: generateShowingId(
        attributes,
        `${format(date, "yyyy-MM-dd-HHmm")}-${title}`,
      ),
      title,
      url: url || attributes.url,
      overview: createOverview({}),
      performances: [
        createPerformance({
          date,
          url: url || attributes.url,
          status: { soldOut: ticketsRemaining === 0 },
          accessibility: createAccessibility(title, {}, description),
          format: createFormat(title, {}, description),
          occasions: createOccasions(title, {}, description, { date }),
        }),
      ],
      matchingHints: { overview: description },
    };
  });

  return movies.concat(Object.values(sourcedEvents).flat());
}

module.exports = transform;
